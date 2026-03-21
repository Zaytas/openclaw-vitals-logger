// ─── Plugin Config ───

export interface VitalsLoggerConfig {
  enabled: boolean;
  channels: string[];
  dataFile: string;
  timezone: string;
  activityTypes: string[];
  extraction: ExtractionConfig;
  dedup: DedupConfig;
  confirmation: ConfirmationConfig;
  preGate: PreGateConfig;
  rateLimiting: RateLimitConfig;
  debug: DebugConfig;
  presets: PresetsMap;
  activityDefaults: ActivityDefaultsMap;
}

/** Kept for backward compat — timeout no longer used in v2 but field stays */
export interface ExtractionConfig {
  timeout: number;
}

export interface DedupConfig {
  enabled: boolean;
  windowDays: number;
  confirmDuplicates: boolean;
  durationTolerancePercent: number;
  distanceTolerancePercent: number;
  pendingExpireMinutes: number;
}

export interface ConfirmationConfig {
  enabled: boolean;
}

export interface PreGateConfig {
  minMessageLength: number;
  scoreThreshold: number;
  activityNouns: string[];
  pastTenseVerbs: string[];
  durationWords: string[];
  distanceWords: string[];
  negativePatterns: string[];
}

export interface RateLimitConfig {
  enabled: boolean;
  cooldownMs: number;
}

export interface DebugConfig {
  logDetections: boolean;
  logExtractions: boolean;
  logSkips: boolean;
}

// ─── Activity Presets ───

export interface ActivityPreset {
  type: string;
  duration: number | null;
  distance: number | null;
  distanceUnit: string | null;
  description: string;
  people: string[];
}

export type PresetsMap = Record<string, ActivityPreset>;

// ─── Activity Defaults ───

export interface ActivityDefaultValues {
  distance?: number;
  distanceUnit?: string;
  duration?: number;
  people?: string[];
  description?: string;
}

export type ActivityDefaultsMap = Record<string, ActivityDefaultValues>;

// ─── Activity Data ───

export interface Activity {
  id: string;
  date: string;
  time: string | null;
  type: string;
  duration: number | null;
  distance: number | null;
  distanceUnit: string | null;
  description: string;
  people: string[];
  source: string;
  stravaUrl: string | null;
  stravaData: unknown | null;
}

export interface VitalsData {
  activities: Activity[];
  weightLog: unknown[];
  goals: unknown[];
  [key: string]: unknown;
}

// ─── Extraction (v2 — regex-based) ───

export interface ExtractedActivity {
  type: string;
  duration: number | null;
  distance: number | null;
  distanceUnit: string | null;
  date: string | null;
  time: string | null;
  description: string;
  people: string[];
}

export interface ExtractionResult {
  success: boolean;
  activity?: ExtractedActivity;
  /** Fields we couldn't extract — used for "ask user" prompt */
  missing?: string[];
}

// ─── Dedup (v2 — simplified, no pending state) ───

export interface PendingCandidate {
  activity: Activity;
  matchedExisting: Activity;
  timestamp: number;
  sessionId: string;
}

export interface PendingState {
  candidates: PendingCandidate[];
}

// ─── Plugin API ───

export interface PluginApi {
  on(event: string, handler: (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown): void;
  pluginConfig?: Partial<VitalsLoggerConfig>;
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

export interface HookEvent {
  prompt?: string;
  messages?: Array<{ role: string; content: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface HookCtx {
  sessionId?: string;
  sessionKey?: string;
  isSubagent?: boolean;
  parentSessionKey?: string;
  channel?: string;
  session?: {
    key?: string;
    id?: string;
    parentKey?: string;
    channel?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PreGateResult {
  pass: boolean;
  score: number;
  reasons: string[];
}
