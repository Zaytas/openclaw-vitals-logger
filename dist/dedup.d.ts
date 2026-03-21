import type { Activity, DedupConfig } from './types.js';
/**
 * Check if a new activity is a duplicate of any existing activity.
 * Returns the matched existing activity, or undefined if no duplicate.
 */
export declare function isDuplicate(newActivity: Activity, existingActivities: Activity[], config: DedupConfig): Activity | undefined;
//# sourceMappingURL=dedup.d.ts.map