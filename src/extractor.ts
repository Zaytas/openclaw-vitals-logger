import type { ExtractedActivity, ExtractionResult, ActivityDefaultValues } from './types.js';
import { getTodayDate, getYesterdayDate } from './utils.js';
import type { Logger } from './utils.js';

// ─── Activity type mapping ───

const ACTIVITY_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\b(walk|walked|walking)\b/i, type: 'walking' },
  { pattern: /\b(hike|hiked|hiking)\b/i, type: 'hiking' },
  { pattern: /\b(bike|biked|biking|cycling|cycled|rode\s+(?:my\s+)?bike)\b/i, type: 'cycling' },
  { pattern: /\b(run|ran|running|jogged|jogging|jog)\b/i, type: 'running' },
  { pattern: /\b(swim|swam|swimming)\b/i, type: 'swimming' },
  { pattern: /\b(yoga)\b/i, type: 'yoga' },
  { pattern: /\b(pickleball)\b/i, type: 'pickleball' },
  { pattern: /\b(weights|lifting|lifted)\b/i, type: 'weights' },
  { pattern: /\b(ruck|rucked|rucking)\b/i, type: 'hiking' },
  { pattern: /\b(peloton|spin\s+class|spinning)\b/i, type: 'cycling' },
  { pattern: /\b(elliptical)\b/i, type: 'other' },
  { pattern: /\b(workout|exercised)\b/i, type: 'other' },
];

// ─── Distance extraction ───

const DISTANCE_PATTERN = /(\d+\.?\d*)\s*(miles?|mi|km|kilometers?)\b/i;

function normalizeDistanceUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('km') || lower.startsWith('kilometer')) return 'km';
  return 'miles';
}

// ─── Duration extraction ───

const DURATION_PATTERNS: RegExp[] = [
  // "45 min", "30 minutes", "2 hours", "1.5 hrs"
  /(\d+\.?\d*)\s*(min(?:utes?)?|hrs?|hours?)\b/i,
  // "an hour", "a half hour"
  /\b(?:an?|one)\s+hour\b/i,
  /\bhalf\s+(?:an?\s+)?hour\b/i,
];

function extractDuration(message: string): number | null {
  for (const pattern of DURATION_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      if (/\bhalf\s+(?:an?\s+)?hour\b/i.test(match[0])) return 30;
      if (/\b(?:an?|one)\s+hour\b/i.test(match[0])) return 60;

      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('h')) return Math.round(value * 60);
      return Math.round(value);
    }
  }
  return null;
}

// ─── People extraction ───

const PEOPLE_PATTERN = /\bwith\s+([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)*)/g;

function extractPeople(message: string): string[] {
  const people: string[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex
  PEOPLE_PATTERN.lastIndex = 0;
  while ((match = PEOPLE_PATTERN.exec(message)) !== null) {
    const raw = match[1];
    // Split on "and" / "&"
    const names = raw.split(/\s+(?:and|&)\s+/i).map(n => n.trim()).filter(Boolean);
    // Filter out common false positives
    const falsePositives = new Set(['the', 'my', 'a', 'an', 'some', 'no']);
    for (const name of names) {
      if (!falsePositives.has(name.toLowerCase()) && /^[A-Z]/.test(name)) {
        people.push(name);
      }
    }
  }
  return [...new Set(people)];
}

// ─── Time extraction ───

const TIME_PATTERNS: Array<{ pattern: RegExp; resolve: (m: RegExpExecArray) => string }> = [
  {
    pattern: /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    resolve: (m) => m[1].trim(),
  },
  {
    pattern: /\bthis\s+morning\b/i,
    resolve: () => 'morning',
  },
  {
    pattern: /\bthis\s+afternoon\b/i,
    resolve: () => 'afternoon',
  },
  {
    pattern: /\bthis\s+evening\b|tonight\b/i,
    resolve: () => 'evening',
  },
  {
    pattern: /\blunch(?:\s*time)?\b/i,
    resolve: () => 'noon',
  },
];

function extractTime(message: string): string | null {
  for (const { pattern, resolve } of TIME_PATTERNS) {
    const match = pattern.exec(message);
    if (match) return resolve(match);
  }
  return null;
}

// ─── Date extraction ───

function extractDate(message: string, timezone: string): string {
  if (/\byesterday\b/i.test(message)) return getYesterdayDate(timezone);
  // Default: today
  return getTodayDate(timezone);
}

// ─── Build description ───

function buildDescription(type: string, distance: number | null, distanceUnit: string | null, duration: number | null, people: string[]): string {
  const parts: string[] = [type];

  if (distance != null) {
    parts.push(`${distance} ${distanceUnit || 'miles'}`);
  }
  if (duration != null) {
    if (duration >= 60 && duration % 60 === 0) {
      parts.push(`${duration / 60}h`);
    } else {
      parts.push(`${duration}min`);
    }
  }
  if (people.length > 0) {
    parts.push(`with ${people.join(' and ')}`);
  }

  return parts.join(', ');
}

// ─── Apply activity defaults ───

function applyDefaults(activity: ExtractedActivity, defaults: ActivityDefaultValues | undefined, userMentionedPeople: boolean): ExtractedActivity {
  if (!defaults) return activity;

  const result = { ...activity };

  // Distance: use default only if not explicitly extracted
  if (result.distance == null && defaults.distance != null) {
    result.distance = defaults.distance;
    result.distanceUnit = defaults.distanceUnit || result.distanceUnit;
  }
  // DistanceUnit: fill in if we have distance but no unit and default has one
  if (result.distance != null && result.distanceUnit == null && defaults.distanceUnit) {
    result.distanceUnit = defaults.distanceUnit;
  }

  // Duration: use default only if not explicitly extracted
  if (result.duration == null && defaults.duration != null) {
    result.duration = defaults.duration;
  }

  // People: merge defaults unless user explicitly mentioned someone
  if (!userMentionedPeople && defaults.people && defaults.people.length > 0) {
    // Add default people that aren't already present
    const existing = new Set(result.people.map(p => p.toLowerCase()));
    for (const person of defaults.people) {
      if (!existing.has(person.toLowerCase())) {
        result.people.push(person);
      }
    }
  }

  // Description: use default only if extraction produced no description
  if (defaults.description && (!result.description || result.description === result.type)) {
    result.description = defaults.description;
  }

  return result;
}

// ─── Main extraction function ───

export function extractActivityFromMessage(
  message: string,
  timezone: string,
  log: Logger,
  defaults?: Record<string, ActivityDefaultValues>,
): ExtractionResult {
  // 1. Find activity type
  let activityType: string | null = null;
  for (const { pattern, type } of ACTIVITY_PATTERNS) {
    if (pattern.test(message)) {
      activityType = type;
      break;
    }
  }

  if (!activityType) {
    return { success: false, missing: ['activity type'] };
  }

  // 2. Extract metrics
  const distanceMatch = DISTANCE_PATTERN.exec(message);
  const distance = distanceMatch ? parseFloat(distanceMatch[1]) : null;
  const distanceUnit = distanceMatch ? normalizeDistanceUnit(distanceMatch[2]) : null;

  const duration = extractDuration(message);
  const people = extractPeople(message);
  const time = extractTime(message);
  const date = extractDate(message, timezone);

  // 3. Check if we have at least type — that's sufficient for logging
  const hasAnyMetric = distance != null || duration != null || people.length > 0;
  if (!hasAnyMetric) {
    // We have the activity type but no details — defaults will fill in if configured
  }

  const userMentionedPeople = people.length > 0;

  let activity: ExtractedActivity = {
    type: activityType,
    duration,
    distance,
    distanceUnit,
    date,
    time,
    description: '', // rebuilt after defaults
    people,
  };

  // 4. Apply per-activity-type defaults
  if (defaults) {
    activity = applyDefaults(activity, defaults[activityType], userMentionedPeople);
  }

  // 5. Build description from final values
  activity.description = buildDescription(activity.type, activity.distance, activity.distanceUnit, activity.duration, activity.people);

  log.info(`Extracted: ${activity.description}`);

  return { success: true, activity };
}
