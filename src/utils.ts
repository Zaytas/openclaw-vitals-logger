import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

const PREFIX = '[vitals-logger]';

export function generateActivityId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `act-${timestamp}-${random}`;
}

export function getTodayDate(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function messageFingerprint(sessionId: string, message: string): string {
  return createHash('sha256')
    .update(`${sessionId}:${message}`)
    .digest('hex')
    .substring(0, 16);
}

export function extractLastUserMessage(messages: Array<{ role: string; content: string }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
      return messages[i].content;
    }
  }
  return undefined;
}

export class TtlCache<T> {
  private cache = new Map<string, { value: T; expires: number }>();

  constructor(private defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
    if (this.cache.size > 200) this.cleanup();
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expires) this.cache.delete(key);
    }
  }
}

export function createLogger(api: { logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void } }) {
  return {
    info: (msg: string) => (api.logger?.info ? api.logger.info(`${PREFIX} ${msg}`) : console.log(`${PREFIX} ${msg}`)),
    warn: (msg: string) => (api.logger?.warn ? api.logger.warn(`${PREFIX} ${msg}`) : console.warn(`${PREFIX} ${msg}`)),
    error: (msg: string) => (api.logger?.error ? api.logger.error(`${PREFIX} ${msg}`) : console.error(`${PREFIX} ${msg}`)),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export function safeJsonParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function resolvePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || homedir();
    return filePath.replace(/^~/, home);
  }
  return filePath;
}