import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  isV2ActiveCached,
  getCachedSnapshot,
  setCachedSnapshot,
  clearCachedSnapshot,
  _resetForTest,
  _setCachedSnapshotForTest,
} from '@/lib/v2-runtime-cache';

import {
  getActiveMode,
  isV2Active,
  getRuntimeSnapshot,
  warmRuntimeConfig,
  refreshRuntimeConfig,
  setActiveMode,
  setKillSwitch,
  _resetRuntimeControllerCache,
  _internals,
} from '@/lib/v2-runtime-controller';

type GlobalWithSeams = typeof globalThis & {
  __V2_RUNTIME_STUB_DB__?: Record<string, unknown> | false | 'error' | undefined;
  __V2_RUNTIME_CONTROLLER_SNAPSHOT__?: unknown;
};

function setStubDb(value: GlobalWithSeams['__V2_RUNTIME_STUB_DB__']) {
  (globalThis as GlobalWithSeams).__V2_RUNTIME_STUB_DB__ = value;
}
function clearStubDb() {
  delete (globalThis as GlobalWithSeams).__V2_RUNTIME_STUB_DB__;
}
function clearSnapshotSeam() {
  delete (globalThis as GlobalWithSeams).__V2_RUNTIME_CONTROLLER_SNAPSHOT__;
}

const ENV_KEYS = [
  'V2_RUNTIME_FORCE_MODE',
  'V2_RUNTIME_FORCE_KILL',
  'V2_GLOBAL_ONE_DEVICE_ENABLED',
  'V2_CORS_ALLOWLIST_ENABLED',
  'V2_PLATFORM_ENABLED',
  'LMS_SUPABASE_URL',
  'LMS_SUPABASE_SERVICE_ROLE_KEY',
];

function snapshotEnv() {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}
function restoreEnv(saved: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

beforeEach(() => {
  _resetForTest();
  _resetRuntimeControllerCache();
  clearStubDb();
  clearSnapshotSeam();
});

afterEach(() => {
  _resetForTest();
  _resetRuntimeControllerCache();
  clearStubDb();
  clearSnapshotSeam();
});

describe('v2-runtime-cache — restrict-only master gate', () => {
  it('fail-open: isV2ActiveCached returns true when cache is COLD', () => {
    expect(isV2ActiveCached()).toBe(true);
  });

  it('returns true when snapshot is v2 + killSwitch off', () => {
    _setCachedSnapshotForTest({
      activeMode: 'v2',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    expect(isV2ActiveCached()).toBe(true);
  });

  it('returns false when snapshot is v1', () => {
    _setCachedSnapshotForTest({
      activeMode: 'v1',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    expect(isV2ActiveCached()).toBe(false);
  });

  it('returns false when killSwitch is on (even if activeMode v2)', () => {
    _setCachedSnapshotForTest({
      activeMode: 'v2',
      killSwitch: true,
      ok: true,
      source: 'db_kill_switch',
    });
    expect(isV2ActiveCached()).toBe(false);
  });

  it('setCachedSnapshot respects TTL (expired → fail-open cold)', async () => {
    setCachedSnapshot(
      { activeMode: 'v1', killSwitch: false, ok: true, source: 'db' },
      5
    );
    expect(isV2ActiveCached()).toBe(false);
    await new Promise((r) => setTimeout(r, 15));
    expect(getCachedSnapshot()).toBe(null);
    expect(isV2ActiveCached()).toBe(true); // expired → cold → fail-open
  });

  it('clearCachedSnapshot resets to cold (fail-open)', () => {
    _setCachedSnapshotForTest({
      activeMode: 'v1',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    expect(isV2ActiveCached()).toBe(false);
    clearCachedSnapshot();
    expect(isV2ActiveCached()).toBe(true);
  });
});

describe('v2-runtime-controller — DB stub gate', () => {
  it('stub v2 → activeMode v2, isV2Active true, gate true', async () => {
    setStubDb({ v2_active_mode: 'v2', v2_kill_switch: 'false' });
    expect(await getActiveMode()).toBe('v2');
    expect(await isV2Active()).toBe(true);
    expect(isV2ActiveCached()).toBe(true);
  });

  it('stub v1 → activeMode v1, isV2Active false, gate false', async () => {
    setStubDb({ v2_active_mode: 'v1', v2_kill_switch: 'false' });
    expect(await getActiveMode()).toBe('v1');
    expect(await isV2Active()).toBe(false);
    expect(isV2ActiveCached()).toBe(false);
  });

  it('stub kill switch on → forces v1, isV2Active false', async () => {
    setStubDb({ v2_active_mode: 'v2', v2_kill_switch: 'true' });
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.killSwitch).toBe(true);
    expect(snap.source).toBe('db_kill_switch');
    expect(await isV2Active()).toBe(false);
  });

  it('cold-cache fail-open: before any warm, isV2ActiveCached is true', () => {
    expect(isV2ActiveCached()).toBe(true);
  });

  it('db error stub → fail-closed to v1, source db_error, ok false', async () => {
    setStubDb(false);
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.ok).toBe(false);
    expect(snap.source).toBe('db_error');
    expect(isV2ActiveCached()).toBe(false);
  });

  it('db default (empty rows) → fail-closed to v1, source db_default', async () => {
    setStubDb({});
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.source).toBe('db_default');
    expect(snap.ok).toBe(true);
    expect(isV2ActiveCached()).toBe(false);
  });
});

describe('v2-runtime-controller — lmsSupabaseAdmin null fail-closed', () => {
  it('fail-closed to v1 with source lms_supabase_not_configured', async () => {
    // Real path: with NO stub DB set and LMS_SUPABASE_URL /
    // LMS_SUPABASE_SERVICE_ROLE_KEY absent from the env, the module-scoped
    // lmsSupabaseAdmin is null, so loadSnapshotFromDb hits the
    // `if (!lmsSupabaseAdmin)` branch and fails closed to v1. This asserts the
    // Admin never accidentally serves V2 when it has no DB B credentials.
    if (process.env.LMS_SUPABASE_URL && process.env.LMS_SUPABASE_SERVICE_ROLE_KEY) {
      // Guard: this test only holds when DB B creds are absent (the default in
      // CI / local dev). If they are set, skip rather than hit a real DB.
      return;
    }
    clearStubDb();
    clearSnapshotSeam();
    _resetForTest();
    _resetRuntimeControllerCache();

    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.source).toBe('lms_supabase_not_configured');
    expect(snap.ok).toBe(false);
    expect(isV2ActiveCached()).toBe(false);
    expect(await isV2Active()).toBe(false);
  });
});

describe('v2-runtime-controller — env override escape hatch', () => {
  const saved = snapshotEnv();
  afterEach(() => restoreEnv(saved));

  it('V2_RUNTIME_FORCE_MODE=v2 → activeMode v2, source env_force_mode', async () => {
    process.env.V2_RUNTIME_FORCE_MODE = 'v2';
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v2');
    expect(snap.source).toBe('env_force_mode');
  });

  it('V2_RUNTIME_FORCE_KILL=1 → forces v1 + kill, source env_force_kill', async () => {
    process.env.V2_RUNTIME_FORCE_KILL = '1';
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.killSwitch).toBe(true);
    expect(snap.source).toBe('env_force_kill');
  });
});

describe('v2-runtime-controller — warm/refresh + setActiveMode/setKillSwitch (stub)', () => {
  it('warmRuntimeConfig populates the gate', async () => {
    setStubDb({ v2_active_mode: 'v1', v2_kill_switch: 'false' });
    expect(isV2ActiveCached()).toBe(true); // cold
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(false); // warmed to v1
  });

  it('setActiveMode(v2) upserts stub + refresh flips gate to true', async () => {
    setStubDb({ v2_active_mode: 'v1', v2_kill_switch: 'false' });
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(false);
    const res = await setActiveMode('v2');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.activeMode).toBe('v2');
    expect(isV2ActiveCached()).toBe(true);
  });

  it('setActiveMode rejects invalid mode', async () => {
    setStubDb({});
    const res = await setActiveMode('v3');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid_mode');
  });

  it('setKillSwitch(true) forces v1 on this instance', async () => {
    setStubDb({ v2_active_mode: 'v2', v2_kill_switch: 'false' });
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(true);
    const res = await setKillSwitch('true');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.killSwitch).toBe(true);
    expect(isV2ActiveCached()).toBe(false);
  });

  it('refreshRuntimeConfig re-reads the stub after it changes', async () => {
    const stub: Record<string, unknown> = { v2_active_mode: 'v1', v2_kill_switch: 'false' };
    setStubDb(stub);
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(false);
    stub.v2_active_mode = 'v2';
    await refreshRuntimeConfig();
    expect(isV2ActiveCached()).toBe(true);
  });
});

describe('v2-runtime-controller — normalizeModeToken', () => {
  it('accepts 1/v1 and 2/v2 case-insensitively, rejects others', () => {
    expect(_internals.normalizeModeToken('1')).toBe('v1');
    expect(_internals.normalizeModeToken('V1')).toBe('v1');
    expect(_internals.normalizeModeToken('2')).toBe('v2');
    expect(_internals.normalizeModeToken('v2')).toBe('v2');
    expect(_internals.normalizeModeToken('')).toBe(null);
    expect(_internals.normalizeModeToken('v3')).toBe(null);
    expect(_internals.normalizeModeToken(undefined)).toBe(null);
  });
});

// jsonb boolean regression: Supabase returns a JS boolean (not a string)
// when a site_config row holds a jsonb boolean — e.g. v2_kill_switch
// written via setKillSwitch(true). Before the fix, configRowToValue only
// matched string + object-envelope-string shapes, so a bare `true`/`false`
// fell through and returned null → parseBooleanFlag(null) → false → the
// kill switch silently no-oped (a DB row that should force V1 left V2
// active). Must round-trip to the bare boolean.
describe('v2-runtime-controller — configRowToValue jsonb boolean', () => {
  it('round-trips a bare boolean and an envelope-wrapped boolean', () => {
    const { configRowToValue } = _internals;
    const row = (value: unknown) => ({ value });
    expect(configRowToValue(row(true))).toBe(true);
    expect(configRowToValue(row(false))).toBe(false);
    expect(configRowToValue(row({ val: true }))).toBe(true);
    expect(configRowToValue(row({ value: false }))).toBe(false);
    // boolean takes precedence over a string in the same envelope
    expect(configRowToValue(row({ val: true, value: 'v2' }))).toBe(true);
  });
});
