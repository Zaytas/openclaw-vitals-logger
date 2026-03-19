import type { Activity, DedupConfig, PendingState, PendingCandidate } from './types.js';
import type { Logger } from './utils.js';
export declare function isDuplicate(newActivity: Activity, existingActivities: Activity[], config: DedupConfig): Activity | undefined;
export declare function loadPendingState(pendingFile: string, log: Logger): PendingState;
export declare function savePendingState(pendingFile: string, state: PendingState, log: Logger): void;
export declare function addPendingCandidate(pendingFile: string, candidate: PendingCandidate, config: DedupConfig, log: Logger): void;
export declare function consumePendingCandidate(pendingFile: string, sessionId: string, config: DedupConfig, log: Logger): PendingCandidate | undefined;
export declare function clearPendingState(pendingFile: string, log: Logger): void;
//# sourceMappingURL=dedup.d.ts.map