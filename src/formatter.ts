import type { Activity } from './types.js';

export function formatActivitySummary(activity: Activity): string {
  const parts: string[] = [];

  parts.push(activity.type);

  if (activity.distance != null && activity.distance >= 0) {
    parts.push(`${activity.distance} ${activity.distanceUnit || 'mi'}`);
  }

  if (activity.duration != null && activity.duration >= 0) {
    parts.push(`${activity.duration}min`);
  }

  if (activity.people.length > 0) {
    parts.push(`with ${activity.people.join(', ')}`);
  }

  return parts.join(', ');
}

export function buildLoggedContext(activity: Activity): string {
  const summary = formatActivitySummary(activity);
  return (
    `[Vitals Logger] Activity logged: ${summary}. Acknowledge briefly.`
  );
}

export function buildDuplicateContext(newActivity: Activity, existing: Activity): string {
  const newSummary = formatActivitySummary(newActivity);
  const existingSummary = formatActivitySummary(existing);
  return (
    `[Vitals Logger] Possible duplicate detected. New: "${newSummary}" matches existing: "${existingSummary}". ` +
    `Activity was NOT logged. Ask the user if this is a separate activity they want logged.`
  );
}

export function buildAmbiguousContext(missing: string[]): string {
  return (
    `[Vitals Logger] Activity mentioned but couldn't auto-extract: missing ${missing.join(', ')}. ` +
    `Ask user for details.`
  );
}
