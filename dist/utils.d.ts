export declare function generateActivityId(): string;
export declare function getTodayDate(timezone: string): string;
export declare function messageFingerprint(sessionId: string, message: string): string;
export declare function extractLastUserMessage(messages: Array<{
    role: string;
    content: string;
}>): string | undefined;
export declare class TtlCache<T> {
    private defaultTtlMs;
    private cache;
    constructor(defaultTtlMs: number);
    get(key: string): T | undefined;
    set(key: string, value: T, ttlMs?: number): void;
    has(key: string): boolean;
    private cleanup;
}
export declare function createLogger(api: {
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
        error?: (m: string) => void;
    };
}): {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
};
export type Logger = ReturnType<typeof createLogger>;
export declare function safeJsonParse<T>(text: string): T | undefined;
export declare function resolvePath(filePath: string): string;
//# sourceMappingURL=utils.d.ts.map