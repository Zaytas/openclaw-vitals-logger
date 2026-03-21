import type { Activity } from './types.js';
export declare function formatActivitySummary(activity: Activity): string;
export declare function buildLoggedContext(activity: Activity): string;
export declare function buildDuplicateContext(newActivity: Activity, existing: Activity): string;
export declare function buildAmbiguousContext(missing: string[]): string;
//# sourceMappingURL=formatter.d.ts.map