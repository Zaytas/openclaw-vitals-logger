import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
const PREFIX = '[vitals-logger]';
export function generateActivityId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `act-${timestamp}-${random}`;
}
export function getTodayDate(timezone) {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return formatter.format(new Date());
    }
    catch {
        return new Date().toISOString().slice(0, 10);
    }
}
export function messageFingerprint(sessionId, message) {
    return createHash('sha256')
        .update(`${sessionId}:${message}`)
        .digest('hex')
        .substring(0, 16);
}
export function extractLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
            return messages[i].content;
        }
    }
    return undefined;
}
export function findLastAssistantMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && typeof messages[i].content === 'string') {
            return messages[i].content;
        }
    }
    return undefined;
}
/**
 * Parse a ```vitals-extract``` code fence from assistant text.
 */
export function parseVitalsExtractBlock(text) {
    const regex = /```vitals-extract\s*\n([\s\S]*?)\n\s*```/;
    const match = regex.exec(text);
    if (!match)
        return undefined;
    try {
        return JSON.parse(match[1]);
    }
    catch {
        return undefined;
    }
}
export class TtlCache {
    defaultTtlMs;
    cache = new Map();
    constructor(defaultTtlMs) {
        this.defaultTtlMs = defaultTtlMs;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        this.cache.set(key, {
            value,
            expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
        });
        if (this.cache.size > 200)
            this.cleanup();
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        this.cache.delete(key);
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now > entry.expires)
                this.cache.delete(key);
        }
    }
}
export function createLogger(api) {
    return {
        info: (msg) => (api.logger?.info ? api.logger.info(`${PREFIX} ${msg}`) : console.log(`${PREFIX} ${msg}`)),
        warn: (msg) => (api.logger?.warn ? api.logger.warn(`${PREFIX} ${msg}`) : console.warn(`${PREFIX} ${msg}`)),
        error: (msg) => (api.logger?.error ? api.logger.error(`${PREFIX} ${msg}`) : console.error(`${PREFIX} ${msg}`)),
    };
}
export function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
export function resolvePath(filePath) {
    if (filePath.startsWith('~')) {
        const home = process.env.HOME || process.env.USERPROFILE || homedir();
        return filePath.replace(/^~/, home);
    }
    return filePath;
}
//# sourceMappingURL=utils.js.map