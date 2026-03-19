import type { PreGateConfig, PreGateResult, ActivityPreset, PresetsMap } from './types.js';
export declare function scoreMessage(message: string, config: PreGateConfig): PreGateResult;
export declare function matchPreset(message: string, presets: PresetsMap): {
    key: string;
    preset: ActivityPreset;
} | undefined;
export declare function getDefaultPreGateConfig(): PreGateConfig;
//# sourceMappingURL=pre-gate.d.ts.map