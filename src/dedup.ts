import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import type { Activity, DedupConfig, PendingState, PendingCandidate } from './types.js';
import type { Logger } from './utils.js';
import { safeJsonParse } from './utils.js';

function normalizeDistanceUnit(unit: string | null): string {
  if (!unit) return 'mi';
  const lower = unit.toLowerCase().trim();
  if (lower === 'km' || lower === 'kilometers' || lower === 'kilometer') return 'km';
  return 'mi';
}

function descriptionsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 && intersection.length / union.size > 0.6;
}

export function isDuplicate(
  newActivity: Activity,
  existingActivities: Activity[],
  config: DedupConfig,
): Activity | undefined {
  for (const existing of existingActivities) {
    if (newActivity.date !== existing.date) continue;
    if (newActivity.type.toLowerCase() !== existing.type.toLowerCase()) continue;

    const bothLackMetrics =
      (newActivity.duration == null && existing.duration == null) &&
      (newActivity.distance == null && existing.distance == null);

    if (bothLackMetrics) {
      if (!descriptionsMatch(newActivity.description, existing.description)) continue;
      return existing;
    }

    if ((newActivity.duration != null) !== (existing.duration != null)) continue;
    if ((newActivity.distance != null) !== (existing.distance != null)) continue;

    if (newActivity.duration != null && existing.duration != null) {
      const tolerance = config.durationTolerancePercent / 100;
      const diff = Math.abs(newActivity.duration - existing.duration);
      const max = Math.max(newActivity.duration, existing.duration);
      if (max > 0 && diff / max > tolerance) continue;
    }

    if (newActivity.distance != null && existing.distance != null) {
      const newUnit = normalizeDistanceUnit(newActivity.distanceUnit);
      const existingUnit = normalizeDistanceUnit(existing.distanceUnit);
      if (newUnit !== existingUnit) continue;

      const tolerance = config.distanceTolerancePercent / 100;
      const diff = Math.abs(newActivity.distance - existing.distance);
      const max = Math.max(newActivity.distance, existing.distance);
      if (max > 0 && diff / max > tolerance) continue;
    }

    return existing;
  }

  return undefined;
}

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

export function savePendingState(pendingFile: string, state: PendingState, log: Logger): void {
  try {
    writeFileSync(pendingFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    log.error(`Failed to save pending state: ${err}`);
  }
}

export function addPendingCandidate(
  pendingFile: string,
  candidate: PendingCandidate,
  config: DedupConfig,
  log: Logger,
): void {
  const state = loadPendingState(pendingFile, log);
  const expireMs = config.pendingExpireMinutes * 60 * 1000;
  const now = Date.now();
  state.candidates = state.candidates.filter(c => now - c.timestamp < expireMs);
  state.candidates.push(candidate);
  savePendingState(pendingFile, state, log);
}

export function consumePendingCandidate(
  pendingFile: string,
  sessionId: string,
  config: DedupConfig,
  log: Logger,
): PendingCandidate | undefined {
  const state = loadPendingState(pendingFile, log);
  const expireMs = config.pendingExpireMinutes * 60 * 1000;
  const now = Date.now();
  state.candidates = state.candidates.filter(c => now - c.timestamp < expireMs);

  const idx = state.candidates.findIndex(c => c.sessionId === sessionId);
  if (idx === -1) return undefined;

  const candidate = state.candidates[idx];
  state.candidates.splice(idx, 1);
  savePendingState(pendingFile, state, log);
  return candidate;
}

export function clearPendingState(pendingFile: string, log: Logger): void {
  try {
    if (existsSync(pendingFile)) unlinkSync(pendingFile);
  } catch (err) {
    log.warn(`Failed to clear pending state: ${err}`);
  }
}