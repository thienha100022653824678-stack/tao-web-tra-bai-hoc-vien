// tests/v2-runtime-controller.test.ts
//
// Unit tests for the runtime controller gate (TS port). Covers:
//   - stub v2 → isV2Active true
//   - stub v1 → isV2Active false
//   - kill switch on → false
//   - cold-cache fail-open (before any warm)
//   - lmsSupabaseAdmin null (not configured) → fail-closed v1
//
// Uses the test seams globalThis.__V2_RUNTIME_STUB_DB__ and
// globalThis.__V2_RUNTIME_CONTROLLER_SNAPSHOT__ that the controller exposes
// (mirroring the LMS seams). No network / no real DB.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Force the controller's `lmsSupabaseAdmin` to null for the whole suite. All
// controller tests drive the gate via the stub DB / env-override seams, so no
// real DB client is needed; and the "not configured" test explicitly asserts
// the null-client fail-closed branch. Mocking here makes that deterministic
// regardless of the ambient test environment.
vi.mock('../src/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: {},
  lmsSupabaseAdmin: null
}));

import {
  getActiveMode,
  getRuntimeSnapshot,
  isV2Active,
  warmRuntimeConfig,
  isV2ActiveCached,
  setActiveMode,
  setKillSwitch,
  _resetRuntimeControllerCache
} from '../src/lib/v2-runtime-controller';
import { _resetForTest as resetCache } from '../src/lib/v2-runtime-cache';

const G = globalThis as Record<string, unknown>;

function resetState() {
  _resetRuntimeControllerCache();
  resetCache();
  delete G.__V2_RUNTIME_STUB_DB__;
  delete G.__V2_RUNTIME_CONTROLLER_SNAPSHOT__;
  delete process.env.V2_RUNTIME_FORCE_MODE;
  delete process.env.V2_RUNTIME_FORCE_KILL;
}

describe('v2-runtime-controller', () => {
  beforeEach(resetState);
  afterEach(resetState);

  it('is cold-cache fail-open before any warm (isV2ActiveCached true)', () => {
    expect(isV2ActiveCached()).toBe(true);
  });

  it('stub db v2 → isV2Active true, activeMode v2, source db', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    const mode = await getActiveMode();
    expect(mode).toBe('v2');
    expect(await isV2Active()).toBe(true);
    const snap = await getRuntimeSnapshot();
    expect(snap.source).toBe('db');
    expect(snap.killSwitch).toBe(false);
    // Gate reflects the resolved snapshot (not cold anymore)
    expect(isV2ActiveCached()).toBe(true);
  });

  it('stub db v1 → isV2Active false, activeMode v1', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    const mode = await getActiveMode();
    expect(mode).toBe('v1');
    expect(await isV2Active()).toBe(false);
    expect(isV2ActiveCached()).toBe(false);
  });

  it('stub db kill switch on → false even with v2_active_mode=v2', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '1' };
    expect(await isV2Active()).toBe(false);
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.killSwitch).toBe(true);
    expect(snap.source).toBe('db_kill_switch');
    expect(isV2ActiveCached()).toBe(false);
  });

  it('stub db error (false) → fail-closed v1, source db_error', async () => {
    G.__V2_RUNTIME_STUB_DB__ = false;
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.ok).toBe(false);
    expect(snap.source).toBe('db_error');
    expect(isV2ActiveCached()).toBe(false);
  });

  it('stub db empty (no rows) → fail-closed v1, source db_default', async () => {
    G.__V2_RUNTIME_STUB_DB__ = {};
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.source).toBe('db_default');
    expect(isV2ActiveCached()).toBe(false);
  });

  it('lmsSupabaseAdmin not configured → fail-closed v1, source lms_supabase_not_configured', async () => {
    // lmsSupabaseAdmin is mocked to null. With no stub and no env override,
    // loadSnapshotFromDb must fail-closed to v1 with the dedicated source.
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.source).toBe('lms_supabase_not_configured');
    expect(snap.ok).toBe(false);
    expect(isV2ActiveCached()).toBe(false);
  });

  it('env override V2_RUNTIME_FORCE_MODE=v2 → v2, source env_force_mode', async () => {
    process.env.V2_RUNTIME_FORCE_MODE = 'v2';
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v2');
    expect(snap.source).toBe('env_force_mode');
    expect(isV2ActiveCached()).toBe(true);
  });

  it('env override V2_RUNTIME_FORCE_KILL=1 → v1 + kill, source env_force_kill', async () => {
    process.env.V2_RUNTIME_FORCE_KILL = '1';
    const snap = await getRuntimeSnapshot();
    expect(snap.activeMode).toBe('v1');
    expect(snap.killSwitch).toBe(true);
    expect(snap.source).toBe('env_force_kill');
    expect(isV2ActiveCached()).toBe(false);
  });

  it('warmRuntimeConfig populates the synchronous gate from a stub db', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    // Before warm: cold → fail-open true
    expect(isV2ActiveCached()).toBe(true);
    const result = await warmRuntimeConfig();
    expect(result).toBe(true);
    expect(isV2ActiveCached()).toBe(true);
  });

  it('warmRuntimeConfig with v1 stub flips gate to false (no longer cold)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    const result = await warmRuntimeConfig();
    expect(result).toBe(false);
    expect(isV2ActiveCached()).toBe(false);
  });

  it('setActiveMode via stub db writes + refreshes (v1 → v2)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(false);
    const res = await setActiveMode('v2');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.activeMode).toBe('v2');
    expect(isV2ActiveCached()).toBe(true);
  });

  it('setActiveMode rejects invalid mode', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    const res = await setActiveMode('v3');
    expect(res.ok).toBe(false);
  });

  it('setKillSwitch via stub db forces v1', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    await warmRuntimeConfig();
    expect(isV2ActiveCached()).toBe(true);
    const res = await setKillSwitch('1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.killSwitch).toBe(true);
    expect(isV2ActiveCached()).toBe(false);
  });
});
