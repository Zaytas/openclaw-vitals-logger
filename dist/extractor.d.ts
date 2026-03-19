import type { ExtractionResult } from './types.js';
import type { Logger } from './utils.js';
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
export declare function buildExtractionPrompt(message: string, today: string): string;
/**
 * Validate an extraction result against expected schema.
 * Returns the validated result or undefined if invalid.
 */
export declare function validateExtractionResult(raw: unknown, log: Logger): ExtractionResult | undefined;
/**
 * Parse a JSON extraction result from text (handles markdown code blocks).
 */
export declare function parseExtractionJson(text: string, log: Logger): ExtractionResult | undefined;
//# sourceMappingURL=extractor.d.ts.map