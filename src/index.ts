import type {
  VitalsLoggerConfig,
  PluginApi,
  HookEvent,
  HookCtx,
  Activity,
} from './types.js';
import {
  createLogger,
  TtlCache,
  messageFingerprint,
  extractLastUserMessage,
  findLastAssistantMessage,
  parseVitalsExtractBlock,
  generateActivityId,
  getTodayDate,
  resolvePath,
} from './utils.js';
import { scoreMessage, getDefaultPreGateConfig, matchPreset } from './pre-gate.js';
import { validateExtractionResult } from './extractor.js';
import { isDuplicate, loadPendingState, addPendingCandidate, consumePendingCandidate } from './dedup.js';
import { appendActivity, getRecentActivities } from './logger.js';
import { buildLoggedContext, buildDuplicateContext } from './formatter.js';

const DEFAULT_CONFIG: VitalsLoggerConfig = {
  enabled: true,
  channels: ['signal'],
  dataFile: '~/.openclaw/workspace/data/vitals.json',
  timezone: 'UTC',
  activityTypes: [
    'walking', 'cycling', 'running', 'swimming', 'weights',
    'yoga', 'pickleball', 'hiking', 'other',
  ],
  extraction: {
    timeout: 120000,
  },
  dedup: {
    enabled: true,
    windowDays: 1,
    confirmDuplicates: true,
    durationTolerancePercent: 20,
    distanceTolerancePercent: 20,
    pendingExpireMinutes: 10,
  },
  confirmation: {
    enabled: true,
  },
  preGate: getDefaultPreGateConfig(),
  rateLimiting: {
    enabled: true,
    cooldownMs: 5000,
  },
  debug: {
    logDetections: false,
    logExtractions: false,
    logSkips: false,
  },
  presets: {},
};

function mergeConfig(userConfig?: Partial<VitalsLoggerConfig>): VitalsLoggerConfig {
  if (!userConfig) return { ...DEFAULT_CONFIG };

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    extraction: { ...DEFAULT_CONFIG.extraction, ...userConfig.extraction },
    dedup: { ...DEFAULT_CONFIG.dedup, ...userConfig.dedup },
    confirmation: { ...DEFAULT_CONFIG.confirmation, ...userConfig.confirmation },
    preGate: { ...DEFAULT_CONFIG.preGate, ...userConfig.preGate },
    rateLimiting: { ...DEFAULT_CONFIG.rateLimiting, ...userConfig.rateLimiting },
    debug: { ...DEFAULT_CONFIG.debug, ...userConfig.debug },
    presets: { ...DEFAULT_CONFIG.presets, ...userConfig.presets },
  };
}

function resolveSessionId(ctx: HookCtx): string {
  return (
    ctx.sessionId ||
    ctx.sessionKey ||
    ctx.session?.key ||
    ctx.session?.id ||
    'unknown'
  );
}

function resolveChannel(ctx: HookCtx): string | undefined {
  return ctx.channel || ctx.session?.channel || undefined;
}

function isConfirmation(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const confirmPatterns = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay',
    'log it', 'go ahead', 'confirm', 'do it', 'please log',
    'y', 'affirmative',
  ];
  return confirmPatterns.some(p => lower === p || lower.startsWith(p + ' ') || lower.startsWith(p + ',') || lower.startsWith(p + '.'));
}

function isRejection(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const rejectPatterns = [
    'no', 'nope', 'nah', "don't", 'dont', 'skip',
    'cancel', 'never mind', 'nevermind', 'n',
    "don't log", 'dont log', 'skip it', 'no thanks',
  ];
  return rejectPatterns.some(p => lower === p || lower.startsWith(p + ' ') || lower.startsWith(p + ',') || lower.startsWith(p + '.'));
}

function isSubagentSession(ctx: HookCtx): boolean {
  if (ctx.isSubagent === true) return true;
  if (ctx.sessionKey && ctx.sessionKey.includes(':subagent:')) return true;
  if (ctx.session?.key && ctx.session.key.includes(':subagent:')) return true;
  if (ctx.parentSessionKey) return true;
  if (ctx.session?.parentKey) return true;
  return false;
}

export default function register(api: PluginApi): void {
  const config = mergeConfig(api.pluginConfig as Partial<VitalsLoggerConfig> | undefined);
  const log = createLogger(api);

  if (!config.enabled) {
    log.info('Plugin disabled');
    return;
  }

  // Idempotency cache — prevents double-logging on prompt rebuilds
  const processedCache = new TtlCache<boolean>(30000);

  // Rate limit cache — per-channel, set only AFTER positive detection
  const rateLimitCache = new TtlCache<boolean>(config.rateLimiting.cooldownMs);

  // Pending extractions — tracks sessions awaiting agent extraction response
  const pendingExtractions = new TtlCache<{ channel: string }>(config.extraction.timeout);

  const pendingFile = resolvePath(config.dataFile) + '.pending.json';

  log.info(`Registered — channels: [${config.channels.join(', ')}], data: ${config.dataFile}`);

  api.on('before_prompt_build', async (_event: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const event = _event as unknown as HookEvent;
      const hookCtx = ctx as unknown as HookCtx;

      // ── Skip subagents ──
      if (isSubagentSession(hookCtx)) {
        if (config.debug.logSkips) log.info('Skip: subagent session');
        return undefined;
      }

      // ── Channel filter — strict when configured ──
      const channel = resolveChannel(hookCtx);
      if (config.channels.length > 0) {
        if (!channel) {
          if (config.debug.logSkips) log.info('Skip: no channel info, channels filter is configured');
          return undefined;
        }
        if (!config.channels.includes(channel)) {
          if (config.debug.logSkips) log.info(`Skip: channel ${channel} not in ${config.channels.join(',')}`);
          return undefined;
        }
      }

      // ── Extract messages ──
      const messages = event.messages as Array<{ role: string; content: string }> | undefined;
      if (!messages || messages.length === 0) {
        if (config.debug.logSkips) log.info('Skip: no messages');
        return undefined;
      }

      const userMessage = extractLastUserMessage(messages);
      if (!userMessage) {
        if (config.debug.logSkips) log.info('Skip: no user message found');
        return undefined;
      }

      const sessionId = resolveSessionId(hookCtx);

      // ── Idempotency check ──
      const fingerprint = messageFingerprint(sessionId, userMessage);
      if (processedCache.has(fingerprint)) {
        if (config.debug.logSkips) log.info('Skip: already processed (idempotency)');
        return undefined;
      }

      // ── Check for completed extraction from agent's last reply ──
      if (pendingExtractions.has(sessionId)) {
        const lastAssistant = findLastAssistantMessage(messages);
        if (lastAssistant) {
          const extractionData = parseVitalsExtractBlock(lastAssistant);
          if (extractionData) {
            const pendingInfo = pendingExtractions.get(sessionId);
            pendingExtractions.delete(sessionId);
            processedCache.set(fingerprint, true);

            const validated = validateExtractionResult(extractionData, log);
            if (validated && validated.detected && validated.activity) {
              const today = getTodayDate(config.timezone);
              const activity: Activity = {
                id: generateActivityId(),
                date: validated.activity.date || today,
                time: validated.activity.time,
                type: validated.activity.type,
                duration: validated.activity.duration,
                distance: validated.activity.distance,
                distanceUnit: validated.activity.distanceUnit,
                description: validated.activity.description,
                people: [...validated.activity.people],
                source: pendingInfo?.channel || channel || 'unknown',
                stravaUrl: validated.activity.stravaUrl,
                stravaData: null,
              };

              // Dedup
              if (config.dedup.enabled) {
                const recent = getRecentActivities(config.dataFile, config.dedup.windowDays, log);
                const dup = isDuplicate(activity, recent, config.dedup);
                if (dup) {
                  if (config.dedup.confirmDuplicates) {
                    addPendingCandidate(pendingFile, {
                      activity,
                      matchedExisting: dup,
                      timestamp: Date.now(),
                      sessionId,
                    }, config.dedup, log);
                    return { appendSystemContext: buildDuplicateContext(activity, dup) };
                  }
                  log.info('Extraction skipped — duplicate');
                  return undefined;
                }
              }

              const success = await appendActivity(config.dataFile, activity, log);
              if (success) {
                if (config.debug.logExtractions) log.info(`Extracted and logged: ${activity.type}`);
                // Agent already said "✅ Logged: ..." — no need to inject again
                return undefined;
              }
            }
          }
        }
        // If no extraction found, clear pending (expired or agent didn't include it)
        pendingExtractions.delete(sessionId);
      }

      // ── Preset check (runs before pre-gate) ──
      if (Object.keys(config.presets).length > 0) {
        const presetMatch = matchPreset(userMessage, config.presets);
        if (presetMatch) {
          processedCache.set(fingerprint, true);
          const today = getTodayDate(config.timezone);
          const activity: Activity = {
            id: generateActivityId(),
            date: today,
            time: null,
            type: presetMatch.preset.type,
            duration: presetMatch.preset.duration,
            distance: presetMatch.preset.distance,
            distanceUnit: presetMatch.preset.distanceUnit,
            description: presetMatch.preset.description,
            people: [...presetMatch.preset.people],
            source: channel || 'unknown',
            stravaUrl: null,
            stravaData: null,
          };

          // Dedup check
          if (config.dedup.enabled) {
            const recent = getRecentActivities(config.dataFile, config.dedup.windowDays, log);
            const dup = isDuplicate(activity, recent, config.dedup);
            if (dup) {
              if (config.dedup.confirmDuplicates) {
                addPendingCandidate(pendingFile, {
                  activity,
                  matchedExisting: dup,
                  timestamp: Date.now(),
                  sessionId,
                }, config.dedup, log);
                return { appendSystemContext: buildDuplicateContext(activity, dup) };
              }
              log.info(`Preset "${presetMatch.key}" skipped — duplicate`);
              return undefined;
            }
          }

          const success = await appendActivity(config.dataFile, activity, log);
          if (success && config.confirmation.enabled) {
            return { appendSystemContext: buildLoggedContext(activity) };
          }
          return undefined;
        }
      }

      // ── Pending duplicate confirmation check ──
      if (config.dedup.enabled && config.dedup.confirmDuplicates) {
        const pending = loadPendingState(pendingFile, log);
        const hasPending = pending.candidates.some(c => c.sessionId === sessionId);

        if (hasPending) {
          if (isConfirmation(userMessage)) {
            const candidate = consumePendingCandidate(pendingFile, sessionId, config.dedup, log);
            if (candidate) {
              processedCache.set(fingerprint, true);
              const success = await appendActivity(config.dataFile, candidate.activity, log);
              if (success) {
                return { appendSystemContext: buildLoggedContext(candidate.activity) };
              }
            }
            return undefined;
          }

          if (isRejection(userMessage)) {
            consumePendingCandidate(pendingFile, sessionId, config.dedup, log);
            processedCache.set(fingerprint, true);
            return { appendSystemContext: '[Vitals Logger] User declined to log the duplicate activity. Acknowledged.' };
          }

          // Not a confirmation or rejection — let message flow through normal pipeline
        }
      }

      // ── Pre-gate scoring ──
      const gateResult = scoreMessage(userMessage, config.preGate);
      if (!gateResult.pass) {
        if (config.debug.logDetections) {
          log.info(`Pre-gate fail (score=${gateResult.score}): ${gateResult.reasons.join(', ')}`);
        }
        processedCache.set(fingerprint, true);
        return undefined;
      }

      if (config.debug.logDetections) {
        log.info(`Pre-gate pass (score=${gateResult.score}): ${gateResult.reasons.join(', ')}`);
      }

      // ── Rate limiting (AFTER positive detection) ──
      if (config.rateLimiting.enabled) {
        const rlKey = `detect:${channel || 'default'}`;
        if (rateLimitCache.has(rlKey)) {
          if (config.debug.logSkips) log.info('Skip: rate limited');
          processedCache.set(fingerprint, true);
          return undefined;
        }
        rateLimitCache.set(rlKey, true);
      }

      // ── Mark as processed ──
      processedCache.set(fingerprint, true);

      // ── Build extraction instruction for the agent ──
      const today = getTodayDate(config.timezone);

      // Track pending extraction
      pendingExtractions.set(sessionId, { channel: channel || 'unknown' });

      const extractionInstruction = [
        `[Vitals Logger] A physical activity was detected in the user's message (score: ${gateResult.score}).`,
        `Extract the activity details and include this JSON block in your response (inside a code fence tagged vitals-extract):`,
        '',
        '```vitals-extract',
        JSON.stringify({
          detected: true,
          activity: {
            type: `<one of: ${config.activityTypes.join(', ')}>`,
            duration: '<minutes as number, or null>',
            distance: '<number, or null>',
            distanceUnit: '<miles|km|null>',
            date: today,
            time: '<time string or null>',
            description: '<brief summary>',
            people: ['<names or empty array>'],
            stravaUrl: '<URL or null>',
          },
        }, null, 2),
        '```',
        '',
        `Replace placeholder values with actual data from the user's message. Use null for unknown fields.`,
        `If this is NOT actually a physical activity, set "detected" to false.`,
        `After the JSON block, briefly confirm to the user: "✅ Logged: [summary]"`,
      ].join('\n');

      return { appendSystemContext: extractionInstruction };
    } catch (err) {
      // FAIL OPEN — never crash the gateway
      log.error(`Hook error: ${err}`);
      return undefined;
    }
  });
}
