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
import { scoreMessage, getDefaultPreGateConfig } from './pre-gate.js';
import { buildExtractionPrompt, validateExtractionResult, parseExtractionJson } from './extractor.js';
import { isDuplicate, loadPendingState, addPendingCandidate, consumePendingCandidate } from './dedup.js';
import { appendActivity, getRecentActivities } from './logger.js';
import { buildLoggedContext, buildDuplicateContext, buildPendingCheckContext, formatConfirmation } from './formatter.js';

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
    model: 'google/gemini-2.0-flash',
    maxTokens: 500,
    timeout: 10000,
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
    style: 'inline',
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

/**
 * Check if user message is a confirmation for a pending duplicate.
 */
function isConfirmation(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const confirmPatterns = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay',
    'log it', 'go ahead', 'confirm', 'do it', 'please log',
    'y', 'affirmative',
  ];
  return confirmPatterns.some(p => lower === p || lower.startsWith(p + ' ') || lower.startsWith(p + ',') || lower.startsWith(p + '.'));
}

export default function register(api: PluginApi): void {
  const config = mergeConfig(api.pluginConfig as Partial<VitalsLoggerConfig> | undefined);
  const log = createLogger(api);

  if (!config.enabled) {
    log.info('Plugin disabled');
    return;
  }

  // Idempotency cache — prevents double-logging on prompt rebuilds
  const processedCache = new TtlCache<boolean>(30000); // 30s TTL

  // Rate limit cache — per-channel cooldown
  const rateLimitCache = new TtlCache<boolean>(config.rateLimiting.cooldownMs);

  const pendingFile = resolvePath(config.dataFile) + '.pending.json';

  log.info(`Registered — channels: [${config.channels.join(', ')}], data: ${config.dataFile}`);

  api.on('before_prompt_build', async (_event: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const event = _event as unknown as HookEvent;
      const hookCtx = ctx as unknown as HookCtx;

      // Skip subagents
      if (hookCtx.isSubagent) {
        if (config.debug.logSkips) log.info('Skip: subagent');
        return undefined;
      }

      // Channel filter
      const channel = resolveChannel(hookCtx);
      if (config.channels.length > 0 && channel && !config.channels.includes(channel)) {
        if (config.debug.logSkips) log.info(`Skip: channel ${channel} not in ${config.channels.join(',')}`);
        return undefined;
      }

      // Extract last user message
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

      // Idempotency check
      const fingerprint = messageFingerprint(sessionId, userMessage);
      if (processedCache.has(fingerprint)) {
        if (config.debug.logSkips) log.info('Skip: already processed (idempotency)');
        return undefined;
      }

      // Check for pending duplicate confirmation first
      if (config.dedup.enabled && config.dedup.confirmDuplicates) {
        const pending = loadPendingState(pendingFile, log);
        const hasPending = pending.candidates.some(c => c.sessionId === sessionId);

        if (hasPending && isConfirmation(userMessage)) {
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

        if (hasPending) {
          // User didn't confirm — pending will expire naturally
          processedCache.set(fingerprint, true);
          return undefined;
        }
      }

      // Rate limiting
      if (config.rateLimiting.enabled) {
        const rlKey = `rl:${channel || 'default'}`;
        if (rateLimitCache.has(rlKey)) {
          if (config.debug.logSkips) log.info('Skip: rate limited');
          return undefined;
        }
        rateLimitCache.set(rlKey, true);
      }

      // Pre-gate scoring
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

      // Mark as processed BEFORE extraction to prevent double-processing
      processedCache.set(fingerprint, true);

      // Build extraction prompt for the agent
      // Phase 1: We use appendSystemContext to instruct the agent to extract + confirm
      // Phase 2: Direct LLM API call for extraction
      const today = getTodayDate(config.timezone);

      // For now, we do inline extraction via system context injection
      // The agent will see the instruction and handle extraction
      const extractionInstruction = [
        `[Vitals Logger] A physical activity was detected in the user's message (score: ${gateResult.score}).`,
        `Please extract the activity details and log it.`,
        ``,
        `Extract from the user's message:`,
        `- Activity type (one of: ${config.activityTypes.join(', ')})`,
        `- Duration in minutes (if mentioned)`,
        `- Distance and unit (if mentioned)`,
        `- Date (default: ${today})`,
        `- Time (if mentioned)`,
        `- People involved (if mentioned)`,
        `- Strava URL (if mentioned)`,
        ``,
        `After extracting, call the vitals API to log it:`,
        `POST http://localhost:3000/api/vitals with the activity data.`,
        `Then briefly confirm to the user: \"✅ Logged: [summary]\"`,
        ``,
        `If you're unsure whether this is actually a physical activity, ask the user to confirm.`,
      ].join('\n');

      return { appendSystemContext: extractionInstruction };
    } catch (err) {
      // FAIL OPEN — never crash the gateway
      log.error(`Hook error: ${err}`);
      return undefined;
    }
  });
}