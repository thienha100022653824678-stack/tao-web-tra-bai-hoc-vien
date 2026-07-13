const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export const V2_FLAGS = {
  PLATFORM_ENABLED: 'V2_PLATFORM_ENABLED',
  SESSION_LEASE_ENABLED: 'V2_SESSION_LEASE_ENABLED',
  ENTRY_TOKEN_REQUIRED: 'V2_ENTRY_TOKEN_REQUIRED',
  RISK_SCORING_ENABLED: 'V2_RISK_SCORING_ENABLED',
} as const;

export type V2RuntimeMode = 'off' | 'shadow' | 'canary' | 'enabled';

export function getV2Env(name: string, fallback = ''): string {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

export function isV2FlagEnabled(name: string, fallback = false): boolean {
  const value = getV2Env(name);
  if (!value) return fallback;
  return TRUE_VALUES.has(value.toLowerCase());
}

export function getV2ListFlag(name: string): string[] {
  return getV2Env(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getV2RuntimeMode(): V2RuntimeMode {
  const configured = getV2Env('V2_RUNTIME_MODE').toLowerCase();
  if (configured === 'shadow' || configured === 'canary' || configured === 'enabled') {
    return configured;
  }
  return isV2FlagEnabled(V2_FLAGS.PLATFORM_ENABLED) ? 'enabled' : 'off';
}
