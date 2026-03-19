import type { PreGateConfig, PreGateResult, ActivityPreset, PresetsMap } from './types.js';

const DEFAULT_ACTIVITY_NOUNS = [
  'walk', 'bike', 'ride', 'run', 'swim', 'hike',
  'yoga', 'pickleball', 'workout', 'exercise',
  'cycling', 'weights', 'lifting', 'jog',
  'tennis', 'basketball', 'golf', 'rowing',
  'elliptical', 'peloton', 'spin', 'ruck',
  'pushups', 'pullups', 'situps', 'plank',
  'stretch', 'stretching', 'cardio',
];

const DEFAULT_PAST_TENSE = [
  'walked', 'biked', 'rode', 'ran', 'swam', 'hiked',
  'lifted', 'jogged', 'rucked', 'exercised',
  'cycled', 'stretched', 'golfed', 'rowed',
];

const DEFAULT_DURATION_WORDS = [
  'minutes', 'mins', 'min', 'hours', 'hour', 'hr', 'hrs',
];

const DEFAULT_DISTANCE_WORDS = [
  'miles', 'mile', 'mi', 'km', 'kilometers', 'meters',
  'laps', 'yards',
];

const DEFAULT_NEGATIVE_PATTERNS = [
  'walk me through', 'walk you through', 'run that',
  'run the command', 'run this', 'let me walk',
  'running into', 'running the', 'running a test',
  'dry run', 'test run', 'bike lane',
  'swimming in debt', 'exercise caution', 'stretch goal',
];

const SCORE_WEIGHTS = {
  activityNoun: 3,
  pastTenseVerb: 2,
  durationMention: 2,
  distanceMention: 2,
  firstPerson: 1,
  negativePattern: -5,
} as const;

export function scoreMessage(message: string, config: PreGateConfig): PreGateResult {
  if (message.length < config.minMessageLength) {
    return { pass: false, score: 0, reasons: ['message too short'] };
  }

  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;
  const reasons: string[] = [];

  const negatives = config.negativePatterns.length > 0 ? config.negativePatterns : DEFAULT_NEGATIVE_PATTERNS;
  for (const pattern of negatives) {
    if (lower.includes(pattern.toLowerCase())) {
      score += SCORE_WEIGHTS.negativePattern;
      reasons.push(`negative: "${pattern}"`);
    }
  }

  const nouns = config.activityNouns.length > 0 ? config.activityNouns : DEFAULT_ACTIVITY_NOUNS;
  for (const noun of nouns) {
    if (words.includes(noun.toLowerCase())) {
      score += SCORE_WEIGHTS.activityNoun;
      reasons.push(`noun: ${noun}`);
      break;
    }
  }

  const pastTense = config.pastTenseVerbs.length > 0 ? config.pastTenseVerbs : DEFAULT_PAST_TENSE;
  for (const verb of pastTense) {
    if (words.includes(verb.toLowerCase())) {
      score += SCORE_WEIGHTS.pastTenseVerb;
      reasons.push(`past-tense: ${verb}`);
      break;
    }
  }

  const durationWords = config.durationWords.length > 0 ? config.durationWords : DEFAULT_DURATION_WORDS;
  for (const dw of durationWords) {
    if (words.includes(dw.toLowerCase())) {
      score += SCORE_WEIGHTS.durationMention;
      reasons.push(`duration: ${dw}`);
      break;
    }
  }

  const distanceWords = config.distanceWords.length > 0 ? config.distanceWords : DEFAULT_DISTANCE_WORDS;
  for (const dw of distanceWords) {
    if (words.includes(dw.toLowerCase())) {
      score += SCORE_WEIGHTS.distanceMention;
      reasons.push(`distance: ${dw}`);
      break;
    }
  }

  const firstPersonPatterns = [
    /\bi\s+(walk|bike|rode|ran|swim|hike|lift|jog|went|did)/i,
    /\bwe\s+(walk|bike|rode|ran|swim|hike|lift|jog|went|did)/i,
    /\bmy\s+(walk|bike|ride|run|swim|hike|workout)/i,
  ];
  for (const pattern of firstPersonPatterns) {
    if (pattern.test(message)) {
      score += SCORE_WEIGHTS.firstPerson;
      reasons.push('first-person subject');
      break;
    }
  }

  if (/\d+\.?\d*\s*(miles?|mi|km|min(utes?)?|hrs?|hours?|laps?|yards?)/i.test(message)) {
    if (!reasons.some(r => r.startsWith('duration:') || r.startsWith('distance:'))) {
      score += SCORE_WEIGHTS.durationMention;
      reasons.push('number+unit pattern');
    }
  }

  return { pass: score >= config.scoreThreshold, score, reasons };
}

export function matchPreset(message: string, presets: PresetsMap): { key: string; preset: ActivityPreset } | undefined {
  let trimmed = message.trim().toLowerCase();
  if (trimmed.length > 50) return undefined;

  trimmed = trimmed.replace(/[.!?,;:]+$/, '').trim();
  if (!trimmed) return undefined;

  const words = trimmed.split(/\s+/);
  const firstWord = words[0];

  for (const [key, preset] of Object.entries(presets)) {
    const lowerKey = key.toLowerCase();
    if (trimmed === lowerKey) return { key, preset };
    if (firstWord === lowerKey) return { key, preset };
    if (firstWord === lowerKey + 'ed') return { key, preset };
    if (firstWord === lowerKey + 'd') return { key, preset };
  }

  return undefined;
}

export function getDefaultPreGateConfig(): PreGateConfig {
  return {
    minMessageLength: 10,
    scoreThreshold: 4,
    activityNouns: DEFAULT_ACTIVITY_NOUNS,
    pastTenseVerbs: DEFAULT_PAST_TENSE,
    durationWords: DEFAULT_DURATION_WORDS,
    distanceWords: DEFAULT_DISTANCE_WORDS,
    negativePatterns: DEFAULT_NEGATIVE_PATTERNS,
  };
}