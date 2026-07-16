// src/lib/v2-flags.ts
//
// Behavioral feature-flag helpers for the V1/V2 coexistence platform
// (Portal port of the LMS `utils/v2-flags.js`).
//
// Restrict-only master gate: every behavioral V2 feature reader is gated by
// `isV2ActiveCached()` (re-exported here from v2-runtime-cache.ts). When the
// platform is in v1 (or the kill switch is on) every V2 feature reads as OFF
// regardless of its env flag, so flipping the admin switch to V1 immediately
// withdraws all V2 behavior. Cold-cache is fail-open (env flag controls) so
// V1 + existing tests are unchanged.

import { isV2ActiveCached } from './v2-runtime-cache';

export { isV2ActiveCached };

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export const V2_FLAGS = {
  PLATFORM_ENABLED: 'V2_PLATFORM_ENABLED',
  SESSION_LEASE_ENABLED: 'V2_SESSION_LEASE_ENABLED',
  ENTRY_TOKEN_REQUIRED: 'V2_ENTRY_TOKEN_REQUIRED',
  RISK_SCORING_ENABLED: 'V2_RISK_SCORING_ENABLED',
  // RP2-B1 security flags (no V2_ prefix in env). Reported in diagnostics
  // via the GLOBAL_ONE_DEVICE_ENABLED / CORS_ALLOWLIST_ENABLED keys below so
  // the admin runtime-mode UI can show their configured + effective state.
  GLOBAL_ONE_DEVICE_ENABLED: 'V2_GLOBAL_ONE_DEVICE_ENABLED',
  CORS_ALLOWLIST_ENABLED: 'V2_CORS_ALLOWLIST_ENABLED',
} as const;

export type V2RuntimeMode = 'off' | 'shadow' | 'canary' | 'enabled';

type EnvLike = Record<string, string | undefined> | NodeJS.ProcessEnv;

export function getV2Env(name: string, fallback = ''): string {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

export function isV2FlagEnabled(name: string, fallback = false): boolean {
  // Behavioral V2 features are restrict-only gated by the runtime master
  // switch. When the platform is in v1 (or the kill switch is on) every V2
  // feature reads as OFF regardless of its env flag, so flipping the admin
  // switch to V1 immediately withdraws all V2 behavior. Cold-cache is
  // fail-open (env flag controls) so V1 + existing tests are unchanged.
  if (!isV2ActiveCached()) return false;
  const value = getV2Env(name);
  if (!value) return fallback;
  return TRUE_VALUES.has(value.toLowerCase());
}

// Read-only inspection variant: returns the raw env flag value WITHOUT the
// runtime gate. Used by diagnostics/readiness to REPORT what is configured
// on the env (so the admin can see the flag posture) even when the platform
// is currently in v1. Behavioral code must use isV2FlagEnabled() (gated).
export function isV2FlagConfigured(name: string, fallback = false): boolean {
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

// ── RP2-A / RP2-B1 security flags (strict parser) ───────────────────────────
// Pure-function parser: only 1/true/yes/on (case-insensitive, trimmed) become
// true. Anything else (0/false/no/off/empty/undefined/non-string) is false.
// Never raises, never logs, never echoes the env value. Accepts an env-shaped
// value so tests can pass a snapshot without touching process.env.
export function parseBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

// RP2-A CORS allowlist flag. Kept separate from the one-device flag so the
// two features can be enabled independently. Gated by the runtime master
// switch (flipping to V1 disables the allowlist enforcement too); cold-cache
// is fail-open so V1 + existing tests are unchanged.
export function isV2CorsAllowlistEnabled(env: EnvLike = process.env): boolean {
  if (!isV2ActiveCached()) return false;
  return parseBooleanFlag((env as Record<string, string | undefined>)?.V2_CORS_ALLOWLIST_ENABLED);
}

// RP2-B1 global one-device / LMS verified-session enforcement. When true
// (and the platform is in v2), the Portal's lms-entry-token route uses the
// atomic block path (ensureStudentSessionAtomic). When false (or V1), the
// V1 reuse compat path (ensureStudentSessionCompat) is used instead — no
// one-device blocking, reuse the latest active session. This is THE switch
// port: V1 behavior is preserved exactly when this returns false.
//
// Gated by the runtime master switch: when the platform is in v1 mode (or
// the kill switch is on) this returns false regardless of the env flag, so
// flipping the switch back to V1 immediately restores V1 behavior even if
// V2_GLOBAL_ONE_DEVICE_ENABLED is still set on the env. Cold-cache is
// fail-open (env flag controls) so V1 + existing tests are unchanged.
export function isV2GlobalOneDeviceEnabled(env: EnvLike = process.env): boolean {
  if (!isV2ActiveCached()) return false;
  return parseBooleanFlag((env as Record<string, string | undefined>)?.V2_GLOBAL_ONE_DEVICE_ENABLED);
}

export const _internals = { parseBooleanFlag };
