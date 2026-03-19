import type { ExtractionConfig, ExtractionResult } from './types.js';
import type { Logger } from './utils.js';
import { safeJsonParse } from './utils.js';

const EXTRACTION_PROMPT = `Extract activity information from this message. Return JSON only, no markdown.

Message: "{MESSAGE}"
Today's date: {TODAY}

Return this exact JSON structure:
{
  "detected": true or false,
  "activity": {
    "type": "walking|cycling|running|swimming|weights|yoga|pickleball|hiking|other",
    "duration": <minutes as number, or null if not mentioned>,
    "distance": <number, or null if not mentioned>,
    "distanceUnit": "miles" or "km" or null,
    "date": "YYYY-MM-DD" or null (null means today),
    "time": "time string" or null,
    "description": "brief natural language summary of the activity",
    "people": ["names of people mentioned"],
    "stravaUrl": "URL if mentioned, or null"
  }
}

Rules:
- Only set detected:true if the message clearly describes a COMPLETED physical activity
- Future plans ("I'm going to bike tomorrow") → detected:false
- Hypothetical/metaphorical usage → detected:false
- If duration/distance not mentioned, set to null — do NOT guess
- If date not mentioned, set to null (caller will use today)
- Keep description concise and factual
- Return ONLY the JSON object, no other text`;

/**
 * Extract activity data from a message using an LLM.
 * 
 * This function is model-agnostic — it constructs a simple prompt and
 * expects a JSON response. The actual model endpoint is configured by the user.
 * 
 * NOTE: In OpenClaw's plugin context, we don't have direct LLM access.
 * This extraction happens via the appendSystemContext mechanism —
 * we inject an instruction telling the agent to extract and confirm.
 * 
 * For direct extraction (Phase 2), this would use the Gemini/OpenAI API.
 * For now, we build the extraction prompt for the agent to process.
 */
export function buildExtractionPrompt(message: string, today: string): string {
  return EXTRACTION_PROMPT
    .replace('{MESSAGE}', message.replace(/"/g, '\\"'))
    .replace('{TODAY}', today);
}

/**
 * Validate an extraction result against expected schema.
 * Returns the validated result or undefined if invalid.
 */
export function validateExtractionResult(raw: unknown, log: Logger): ExtractionResult | undefined {
  if (!raw || typeof raw !== 'object') {
    log.warn('Extraction result is not an object');
    return undefined;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.detected !== 'boolean') {
    log.warn('Extraction result missing "detected" boolean');
    return undefined;
  }

  if (!obj.detected) {
    return { detected: false };
  }

  const activity = obj.activity as Record<string, unknown> | undefined;
  if (!activity || typeof activity !== 'object') {
    log.warn('Extraction detected=true but no activity object');
    return undefined;
  }

  // Validate required string fields
  if (typeof activity.type !== 'string' || !activity.type) {
    log.warn('Activity missing type');
    return undefined;
  }

  if (typeof activity.description !== 'string') {
    log.warn('Activity missing description');
    return undefined;
  }

  // Validate optional numeric fields
  const duration = typeof activity.duration === 'number' ? activity.duration : null;
  const distance = typeof activity.distance === 'number' ? activity.distance : null;

  // Validate optional string fields
  const distanceUnit = typeof activity.distanceUnit === 'string' ? activity.distanceUnit : null;
  const date = typeof activity.date === 'string' ? activity.date : null;
  const time = typeof activity.time === 'string' ? activity.time : null;
  const stravaUrl = typeof activity.stravaUrl === 'string' ? activity.stravaUrl : null;

  // Validate people array
  const people = Array.isArray(activity.people)
    ? activity.people.filter((p): p is string => typeof p === 'string')
    : [];

  // Validate date format if provided
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    log.warn(`Invalid date format: ${date}`);
    return undefined;
  }

  return {
    detected: true,
    activity: {
      type: activity.type as string,
      duration,
      distance,
      distanceUnit,
      date,
      time,
      description: activity.description as string,
      people,
      stravaUrl,
    },
  };
}

/**
 * Parse a JSON extraction result from text (handles markdown code blocks).
 */
export function parseExtractionJson(text: string, log: Logger): ExtractionResult | undefined {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = safeJsonParse<unknown>(cleaned);
  if (!parsed) {
    log.warn('Failed to parse extraction JSON');
    return undefined;
  }

  return validateExtractionResult(parsed, log);
}