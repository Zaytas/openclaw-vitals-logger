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
  generateActivityId,
  getTodayDate,
  resolvePath,
} from './utils.js';
import { scoreMessage, getDefaultPreGateConfig, matchPreset } from './pre-gate.js';
import { extractActivityFromMessage } from './extractor.js';
import { isDuplicate } from './dedup.js';
import { appendActivity, getRecentActivities } from './logger.js';
import { buildLoggedContext, buildDuplicateContext, buildAmbiguousContext } from './formatter.js';

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
  activityDefaults: {},
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
    activityDefaults: { ...DEFAULT_CONFIG.activityDefaults, ...userConfig.activityDefaults },
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

  // Idempotency cache — prevents double-processing on prompt rebuilds
  const processedCache = new TtlCache<boolean>(30000);

  // Rate limit cache — per-channel, set only AFTER positive detection
  const rateLimitCache = new TtlCache<boolean>(config.rateLimiting.cooldownMs);

  log.info(`Registered v2 — channels: [${config.channels.join(', ')}], data: ${config.dataFile}`);

  api.on('before_prompt_build', async (_event: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const event = _event as unknown as HookEvent;
      const hookCtx = ctx as unknown as HookCtx;

      // ── 1. Skip subagents ──
      if (isSubagentSession(hookCtx)) {
        if (config.debug.logSkips) log.info('Skip: subagent session');
        return undefined;
      }

      // ── 2. Channel filter ──
      const channel = resolveChannel(hookCtx);
      if (config.channels.length > 0) {
        if (!channel) {
          if (config.debug.logSkips) log.info('Skip: no channel info');
          return undefined;
        }
        if (!config.channels.includes(channel)) {
          if (config.debug.logSkips) log.info(`Skip: channel ${channel} not in [${config.channels.join(',')}]`);
          return undefined;
        }
      }

      // ── 3. Get last user message ──
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

      // ── 4. Idempotency check ──
      const fingerprint = messageFingerprint(sessionId, userMessage);
      if (processedCache.has(fingerprint)) {
        if (config.debug.logSkips) log.info('Skip: already processed (idempotency)');
        return undefined;
      }
      processedCache.set(fingerprint, true);

      // ── 5. Preset check (runs before pre-gate) ──
      if (Object.keys(config.presets).length > 0) {
        const presetMatch = matchPreset(userMessage, config.presets);
        if (presetMatch) {
          const today = getTodayDate(config.timezone);
          const activity: Activity = {
            id: generateActivityId(today, presetMatch.preset.type),
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
              log.info(`Preset "${presetMatch.key}" — duplicate detected`);
              if (config.dedup.confirmDuplicates) {
                return { appendSystemContext: buildDuplicateContext(activity, dup) };
              }
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

      // ── 6. Pre-gate scoring ──
      const gateResult = scoreMessage(userMessage, config.preGate);
      if (!gateResult.pass) {
        if (config.debug.logDetections) {
          log.info(`Pre-gate fail (score=${gateResult.score}): ${gateResult.reasons.join(', ')}`);
        }
        return undefined;
      }

      if (config.debug.logDetections) {
        log.info(`Pre-gate pass (score=${gateResult.score}): ${gateResult.reasons.join(', ')}`);
      }

      // ── 7. Rate limiting (after positive detection) ──
      if (config.rateLimiting.enabled) {
        const rlKey = `detect:${channel || 'default'}`;
        if (rateLimitCache.has(rlKey)) {
          if (config.debug.logSkips) log.info('Skip: rate limited');
          return undefined;
        }
        rateLimitCache.set(rlKey, true);
      }

      // ── 8. Extract activity from user message (regex) ──
      const extractResult = extractActivityFromMessage(
        userMessage,
        config.timezone,
        log,
        Object.keys(config.activityDefaults).length > 0 ? config.activityDefaults : undefined,
      );

      if (!extractResult.success || !extractResult.activity) {
        // Extraction failed — activity detected by pre-gate but regex couldn't parse it
        if (config.debug.logExtractions) {
          log.info(`Extraction failed: missing ${extractResult.missing?.join(', ') || 'unknown'}`);
        }
        return { appendSystemContext: buildAmbiguousContext(extractResult.missing || ['activity details']) };
      }

      const extracted = extractResult.activity;

      // ── 9. Build Activity object ──
      const activity: Activity = {
        id: generateActivityId(extracted.date || getTodayDate(config.timezone), extracted.type),
        date: extracted.date || getTodayDate(config.timezone),
        time: extracted.time,
        type: extracted.type,
        duration: extracted.duration,
        distance: extracted.distance,
        distanceUnit: extracted.distanceUnit,
        description: extracted.description,
        people: [...extracted.people],
        source: channel || 'unknown',
        stravaUrl: null,
        stravaData: null,
      };

      // ── 10. Dedup check ──
      if (config.dedup.enabled) {
        const recent = getRecentActivities(config.dataFile, config.dedup.windowDays, log);
        const dup = isDuplicate(activity, recent, config.dedup);
        if (dup) {
          log.info('Duplicate detected — skipping auto-log');
          if (config.dedup.confirmDuplicates) {
            return { appendSystemContext: buildDuplicateContext(activity, dup) };
          }
          return undefined;
        }
      }

      // ── 11. Persist ──
      const success = await appendActivity(config.dataFile, activity, log);
      if (!success) {
        log.error('Failed to persist activity');
        return undefined;
      }

      if (config.debug.logExtractions) {
        log.info(`Logged: ${activity.type} (${activity.id})`);
      }

      // ── 12. Inject acknowledgment for agent ──
      if (config.confirmation.enabled) {
        return { appendSystemContext: buildLoggedContext(activity) };
      }

      return undefined;
    } catch (err) {
      // FAIL OPEN — never crash the gateway
      log.error(`Hook error: ${err}`);
      return undefined;
    }
  });
}
