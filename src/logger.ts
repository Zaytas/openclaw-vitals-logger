import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Activity, VitalsData } from './types.js';
import type { Logger } from './utils.js';
import { safeJsonParse, resolvePath } from './utils.js';

// In-memory mutex for single-process write safety
let writeLock = false;
const writeQueue: Array<() => void> = [];

function acquireLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!writeLock) {
      writeLock = true;
      resolve();
    } else {
      writeQueue.push(resolve);
    }
  });
}

function releaseLock(): void {
  const next = writeQueue.shift();
  if (next) {
    next();
  } else {
    writeLock = false;
  }
}

const EMPTY_DATA: VitalsData = {
  activities: [],
  weightLog: [],
  goals: [],
};

/**
 * Read and parse the vitals data file.
 * If the file is corrupt, back it up and return empty data.
 */
export function readVitalsData(dataFile: string, log: Logger): VitalsData {
  const resolved = resolvePath(dataFile);

  if (!existsSync(resolved)) {
    log.info(`Data file not found, will create: ${resolved}`);
    return { ...EMPTY_DATA };
  }

  try {
    const raw = readFileSync(resolved, 'utf-8');
    const data = safeJsonParse<VitalsData>(raw);

    if (!data || !Array.isArray(data.activities)) {
      log.warn('Data file is corrupt or has unexpected structure, backing up');
      backupCorruptFile(resolved, log);
      return { ...EMPTY_DATA };
    }

    return data;
  } catch (err) {
    log.error(`Failed to read data file: ${err}`);
    backupCorruptFile(resolved, log);
    return { ...EMPTY_DATA };
  }
}

/**
 * Back up a corrupt data file before replacing it.
 */
function backupCorruptFile(filePath: string, log: Logger): void {
  try {
    if (existsSync(filePath)) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      copyFileSync(filePath, backupPath);
      log.warn(`Corrupt file backed up to: ${backupPath}`);
    }
  } catch (err) {
    log.error(`Failed to back up corrupt file: ${err}`);
  }
}

/**
 * Write vitals data using atomic temp-file + rename.
 */
function atomicWrite(filePath: string, data: string, log: Logger): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpFile = join(dir, `.vitals-tmp-${process.pid}-${Date.now()}.json`);

  try {
    writeFileSync(tmpFile, data, 'utf-8');
    renameSync(tmpFile, filePath);
  } catch (err) {
    log.error(`Atomic write failed: ${err}`);
    // Clean up temp file if rename failed
    try {
      if (existsSync(tmpFile)) {
        unlinkSync(tmpFile);
      }
    } catch { /* ignore cleanup errors */ }
    throw err;
  }
}

/**
 * Append an activity to the vitals data file.
 * Uses in-memory mutex + atomic write for safety.
 */
export async function appendActivity(
  dataFile: string,
  activity: Activity,
  log: Logger,
): Promise<boolean> {
  const resolved = resolvePath(dataFile);

  await acquireLock();
  try {
    const data = readVitalsData(dataFile, log);
    data.activities.push(activity);
    const json = JSON.stringify(data, null, 2) + '\n';
    atomicWrite(resolved, json, log);
    log.info(`Activity logged: ${activity.type} on ${activity.date} (${activity.id})`);
    return true;
  } catch (err) {
    log.error(`Failed to append activity: ${err}`);
    return false;
  } finally {
    releaseLock();
  }
}

/**
 * Get recent activities for dedup checking.
 */
export function getRecentActivities(
  dataFile: string,
  windowDays: number,
  log: Logger,
): Activity[] {
  const data = readVitalsData(dataFile, log);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return data.activities.filter(a => a.date >= cutoffStr);
}