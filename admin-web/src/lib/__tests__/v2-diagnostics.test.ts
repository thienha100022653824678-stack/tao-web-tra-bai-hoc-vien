import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  _resetForTest,
} from '@/lib/v2-runtime-cache';
import { _resetRuntimeControllerCache } from '@/lib/v2-runtime-controller';
import { assertV2WorkerAuthorized } from '@/lib/v2-sync-worker';

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

const ENV_KEYS = [
  'INTERNAL_SYNC_SECRET',
  'V2_WORKER_SECRET',
  'V2_GLOBAL_ONE_DEVICE_ENABLED',
  'V2_CORS_ALLOWLIST_ENABLED',
  'V2_PLATFORM_ENABLED',
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
  delete (globalThis as GlobalWithSeams).__V2_RUNTIME_CONTROLLER_SNAPSHOT__;
  vi.resetModules();
});
afterEach(() => {
  _resetForTest();
  _resetRuntimeControllerCache();
  clearStubDb();
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v2/diagnostics', {
    method: 'GET',
    headers,
  });
}

describe('assertV2WorkerAuthorized', () => {
  const saved = snapshotEnv();
  afterEach(() => restoreEnv(saved));

  it('throws 401 when no secret is configured (fail-closed)', () => {
    delete process.env.INTERNAL_SYNC_SECRET;
    delete process.env.V2_WORKER_SECRET;
    expect(() => assertV2WorkerAuthorized(makeReq())).toThrow(/Unauthorized/);
    try {
      assertV2WorkerAuthorized(makeReq());
    } catch (e) {
      expect((e as Error & { statusCode?: number }).statusCode).toBe(401);
    }
  });

  it('throws 401 when provided secret mismatches', () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    delete process.env.V2_WORKER_SECRET;
    expect(() =>
      assertV2WorkerAuthorized(makeReq({ 'x-sync-secret': 'wrong' }))
    ).toThrow(/Unauthorized/);
  });

  it('accepts x-sync-secret matching INTERNAL_SYNC_SECRET', () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    delete process.env.V2_WORKER_SECRET;
    expect(() =>
      assertV2WorkerAuthorized(makeReq({ 'x-sync-secret': 'expected-secret' }))
    ).not.toThrow();
  });

  it('accepts x-v2-worker-secret matching V2_WORKER_SECRET (preferred)', () => {
    process.env.V2_WORKER_SECRET = 'worker-secret';
    process.env.INTERNAL_SYNC_SECRET = 'sync-secret';
    expect(() =>
      assertV2WorkerAuthorized(makeReq({ 'x-v2-worker-secret': 'worker-secret' }))
    ).not.toThrow();
  });
});

describe('api/v2/diagnostics route', () => {
  const saved = snapshotEnv();
  afterEach(() => restoreEnv(saved));

  async function importRoute() {
    return import('@/app/api/v2/diagnostics/route');
  }

  it('GET without secret → 401 Unauthorized', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    const { GET } = await importRoute();
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET with valid secret → 200 + component admin + activeMode + flags, no env leak', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    process.env.V2_CORS_ALLOWLIST_ENABLED = 'true';
    // Force the runtime mode to v1 via the stub so the response is
    // deterministic without a real DB B.
    setStubDb({ v2_active_mode: 'v1', v2_kill_switch: 'false' });

    const { GET } = await importRoute();
    const res = await GET(makeReq({ 'x-sync-secret': 'expected-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.component).toBe('admin');
    expect(body.activeMode).toBe('v1');
    expect(typeof body.killSwitch).toBe('boolean');
    expect(typeof body.source).toBe('string');
    expect(body.flags).toBeDefined();
    expect(body.flags.globalOneDevice).toEqual(
      expect.objectContaining({ configured: true, effective: expect.any(Boolean) })
    );
    expect(body.flags.corsAllowlist).toEqual(
      expect.objectContaining({ configured: true, effective: expect.any(Boolean) })
    );

    // No env leak: the raw secret, env values, or URLs must not appear.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('expected-secret');
    expect(raw).not.toContain('V2_GLOBAL_ONE_DEVICE_ENABLED');
    expect(raw).not.toContain('LMS_SUPABASE');
    expect(raw).not.toContain('service_role');
    expect(raw).not.toContain('ADMIN_PASSWORD');
  });

  it('POST with valid secret → 200 + component admin', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    setStubDb({ v2_active_mode: 'v2', v2_kill_switch: 'false' });
    const { POST } = await importRoute();
    const res = await POST(
      new Request('http://localhost/api/v2/diagnostics', {
        method: 'POST',
        headers: { 'x-sync-secret': 'expected-secret' },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.component).toBe('admin');
    expect(body.activeMode).toBe('v2');
  });

  it('PUT → 405 Method Not Allowed', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    const { PUT } = await importRoute();
    const res = await PUT();
    expect(res.status).toBe(405);
  });

  it('with v1 mode + env flags set: configured true, effective false (restrict-only gate)', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    process.env.V2_CORS_ALLOWLIST_ENABLED = '1';
    setStubDb({ v2_active_mode: 'v1', v2_kill_switch: 'false' });

    const { GET } = await importRoute();
    const res = await GET(makeReq({ 'x-sync-secret': 'expected-secret' }));
    const body = await res.json();
    // configured reports the raw env posture; effective is gated by the master switch.
    expect(body.flags.globalOneDevice.configured).toBe(true);
    expect(body.flags.globalOneDevice.effective).toBe(false);
    expect(body.flags.corsAllowlist.configured).toBe(true);
    expect(body.flags.corsAllowlist.effective).toBe(false);
  });

  it('with v2 mode + env flags set: configured true, effective true', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'expected-secret';
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    process.env.V2_CORS_ALLOWLIST_ENABLED = '1';
    setStubDb({ v2_active_mode: 'v2', v2_kill_switch: 'false' });

    const { GET } = await importRoute();
    const res = await GET(makeReq({ 'x-sync-secret': 'expected-secret' }));
    const body = await res.json();
    expect(body.activeMode).toBe('v2');
    expect(body.flags.globalOneDevice.configured).toBe(true);
    expect(body.flags.globalOneDevice.effective).toBe(true);
    expect(body.flags.corsAllowlist.configured).toBe(true);
    expect(body.flags.corsAllowlist.effective).toBe(true);
  });
});

describe('v2-flags — restrict-only gating', () => {
  const saved = snapshotEnv();
  afterEach(() => {
    restoreEnv(saved);
    _resetForTest();
  });

  it('isV2FlagEnabled returns false when gate is v1, even if env flag is set', async () => {
    process.env.V2_PLATFORM_ENABLED = '1';
    // Import the cache module fresh (after the top-level resetModules) so the
    // snapshot is set on the SAME module instance v2-flags reads from.
    const cache = await import('@/lib/v2-runtime-cache');
    cache._setCachedSnapshotForTest({
      activeMode: 'v1',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    const { isV2FlagEnabled, V2_FLAGS } = await import('@/lib/v2-flags');
    expect(isV2FlagEnabled(V2_FLAGS.PLATFORM_ENABLED)).toBe(false);
  });

  it('isV2FlagConfigured reports raw env even when gate is v1', async () => {
    process.env.V2_PLATFORM_ENABLED = '1';
    const cache = await import('@/lib/v2-runtime-cache');
    cache._setCachedSnapshotForTest({
      activeMode: 'v1',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    const { isV2FlagConfigured, V2_FLAGS } = await import('@/lib/v2-flags');
    expect(isV2FlagConfigured(V2_FLAGS.PLATFORM_ENABLED)).toBe(true);
  });

  it('isV2FlagEnabled returns true when gate is v2 + env flag set', async () => {
    process.env.V2_PLATFORM_ENABLED = '1';
    const cache = await import('@/lib/v2-runtime-cache');
    cache._setCachedSnapshotForTest({
      activeMode: 'v2',
      killSwitch: false,
      ok: true,
      source: 'db',
    });
    const { isV2FlagEnabled, V2_FLAGS } = await import('@/lib/v2-flags');
    expect(isV2FlagEnabled(V2_FLAGS.PLATFORM_ENABLED)).toBe(true);
  });

  it('parseBooleanFlag is strict: only 1/true/yes/on', async () => {
    const { parseBooleanFlag } = await import('@/lib/v2-flags');
    expect(parseBooleanFlag('1')).toBe(true);
    expect(parseBooleanFlag('true')).toBe(true);
    expect(parseBooleanFlag('YES')).toBe(true);
    expect(parseBooleanFlag('on')).toBe(true);
    expect(parseBooleanFlag(true)).toBe(true);
    expect(parseBooleanFlag('0')).toBe(false);
    expect(parseBooleanFlag('false')).toBe(false);
    expect(parseBooleanFlag('enabled')).toBe(false); // strict parser rejects 'enabled'
    expect(parseBooleanFlag('')).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(null)).toBe(false);
    expect(parseBooleanFlag(1)).toBe(false);
  });
});
