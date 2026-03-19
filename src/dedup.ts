import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import type { Activity, DedupConfig, PendingState, PendingCandidate } from './types.js';
import type { Logger } from './utils.js';
import { safeJsonParse } from './utils.js';

/**
 * Check if a new activity is a likely duplicate of an existing one.
 */
export function isDuplicate(
  newActivity: Activity,
  existingActivities: Activity[],
  config: DedupConfig,
): Activity | undefined {
  const windowMs = config.windowDays * 24 * 60 * 60 * 1000;
  const newDate = new Date(newActivity.date).getTime();

  for (const existing of existingActivities) {
    const existingDate = new Date(existing.date).getTime();

    // Check date within window
    if (Math.abs(newDate - existingDate) > windowMs) continue;

    // Must be same date for exact dedup
    if (newActivity.date !== existing.date) continue;

    // Must be same activity type
    if (newActivity.type.toLowerCase() !== existing.type.toLowerCase()) continue;

    // Check duration similarity (if both have values)
    if (newActivity.duration != null && existing.duration != null) {
      const tolerance = config.durationTolerancePercent / 100;
      const diff = Math.abs(newActivity.duration - existing.duration);
      const max = Math.max(newActivity.duration, existing.duration);
      if (max > 0 && diff / max > tolerance) continue;
    }

    // Check distance similarity (if both have values)
    if (newActivity.distance != null && existing.distance != null) {
      const tolerance = config.distanceTolerancePercent / 100;
      const diff = Math.abs(newActivity.distance - existing.distance);
      const max = Math.max(newActivity.distance, existing.distance);
      if (max > 0 && diff / max > tolerance) continue;
    }

    // If we get here, it's a likely duplicate
    return existing;
  }

  return undefined;
}

/**
 * Load pending duplicate candidates from disk.
 */
export function loadPendingState(pendingFile: string, log: Logger): PendingState {
  try {
    if (!existsSync(pendingFile)) return { candidates: [] };
    const raw = readFileSync(pendingFile, 'utf-8');
    const state = safeJsonParse<PendingState>(raw);
    if (!state || !Array.isArray(state.candidates)) return { candidates: [] };
    return state;
  } catch (err) {
    log.warn(`Failed to load pending state: ${err}`);
    return { candidates: [] };
  }
}

/**
 * Save pending duplicate candidates to disk.
 */
export function savePendingState(pendingFile: string, state: PendingState, log: Logger): void {
  try {
    writeFileSync(pendingFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    log.error(`Failed to save pending state: ${err}`);
  }
}

/**
 * Add a pending candidate.
 */
export function addPendingCandidate(
  pendingFile: string,
  candidate: PendingCandidate,
  config: DedupConfig,
  log: Logger,
): void {
  const state = loadPendingState(pendingFile, log);

  // Expire old candidates
  const expireMs = config.pendingExpireMinutes * 60 * 1000;
  const now = Date.now();
  state.candidates = state.candidates.filter(c => now - c.timestamp < expireMs);

  // Add new
  state.candidates.push(candidate);
  savePendingState(pendingFile, state, log);
}

/**
 * Check if there's a pending candidate for this session and remove it (consume).
 * Returns the candidate if found and user confirmed.
 */
export function consumePendingCandidate(
  pendingFile: string,
  sessionId: string,
  config: DedupConfig,
  log: Logger,
): PendingCandidate | undefined {
  const state = loadPendingState(pendingFile, log);

  // Expire old candidates
  const expireMs = config.pendingExpireMinutes * 60 * 1000;
  const now = Date.now();
  state.candidates = state.candidates.filter(c => now - c.timestamp < expireMs);

  // Find candidate for this session
  const idx = state.candidates.findIndex(c => c.sessionId === sessionId);
  if (idx === -1) return undefined;

  const candidate = state.candidates[idx];
  state.candidates.splice(idx, 1);
  savePendingState(pendingFile, state, log);

  return candidate;
}

/**
 * Clear all pending candidates (cleanup).
 */
export function clearPendingState(pendingFile: string, log: Logger): void {
  try {
    if (existsSync(pendingFile)) unlinkSync(pendingFile);
  } catch (err) {
    log.warn(`Failed to clear pending state: ${err}`);
  }
}