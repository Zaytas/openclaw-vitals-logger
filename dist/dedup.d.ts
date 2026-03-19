import type { Activity, DedupConfig, PendingState, PendingCandidate } from './types.js';
import type { Logger } from './utils.js';
/**
 * Check if a new activity is a likely duplicate of an existing one.
 */
export declare function isDuplicate(newActivity: Activity, existingActivities: Activity[], config: DedupConfig): Activity | undefined;
/**
 * Load pending duplicate candidates from disk.
 */
export declare function loadPendingState(pendingFile: string, log: Logger): PendingState;
/**
 * Save pending duplicate candidates to disk.
 */
export declare function savePendingState(pendingFile: string, state: PendingState, log: Logger): void;
/**
 * Add a pending candidate.
 */
export declare function addPendingCandidate(pendingFile: string, candidate: PendingCandidate, config: DedupConfig, log: Logger): void;
/**
 * Check if there's a pending candidate for this session and remove it (consume).
 * Returns the candidate if found and user confirmed.
 */
export declare function consumePendingCandidate(pendingFile: string, sessionId: string, config: DedupConfig, log: Logger): PendingCandidate | undefined;
/**
 * Clear all pending candidates (cleanup).
 */
export declare function clearPendingState(pendingFile: string, log: Logger): void;
//# sourceMappingURL=dedup.d.ts.map