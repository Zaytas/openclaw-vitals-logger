import type { Activity } from './types.js';
/**
 * Format a confirmation message for a logged activity.
 */
export declare function formatConfirmation(activity: Activity): string;
/**
 * Format a duplicate warning message.
 */
export declare function formatDuplicateWarning(newActivity: Activity, existing: Activity): string;
/**
 * Format a brief activity summary.
 */
export declare function formatActivitySummary(activity: Activity): string;
/**
 * Build the system context injection for a confirmed activity log.
 */
export declare function buildLoggedContext(activity: Activity): string;
/**
 * Build the system context injection for a pending duplicate.
 */
export declare function buildDuplicateContext(newActivity: Activity, existing: Activity): string;
/**
 * Build system context to check for duplicate confirmation response.
 */
export declare function buildPendingCheckContext(): string;
//# sourceMappingURL=formatter.d.ts.map