import type { Activity, VitalsData } from './types.js';
import type { Logger } from './utils.js';
/**
 * Read and parse the vitals data file.
 * If the file is corrupt, back it up and return empty data.
 */
export declare function readVitalsData(dataFile: string, log: Logger): VitalsData;
/**
 * Append an activity to the vitals data file.
 * Uses in-memory mutex + atomic write for safety.
 */
export declare function appendActivity(dataFile: string, activity: Activity, log: Logger): Promise<boolean>;
/**
 * Get recent activities for dedup checking.
 */
export declare function getRecentActivities(dataFile: string, windowDays: number, log: Logger): Activity[];
//# sourceMappingURL=logger.d.ts.map