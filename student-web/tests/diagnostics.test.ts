// tests/diagnostics.test.ts
//
// /api/v2/diagnostics — worker-secret-gated runtime posture for the Portal.
// Asserts: no secret → 401, valid secret → 200 with component "portal" and
// the expected shape; no env secret values leak into the response.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock supabase so the controller can be driven by the stub DB seam without
// touching a real client. lmsSupabaseAdmin is non-null so the controller does
// not short-circuit to lms_supabase_not_configured (we exercise that branch
// in the controller test suite).
vi.mock('../src/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: {},
  lmsSupabaseAdmin: {},
}));

import { GET, POST } from '../src/app/api/v2/diagnostics/route';
import { _resetRuntimeControllerCache } from '../src/lib/v2-runtime-controller';
import { _resetForTest as resetCache } from '../src/lib/v2-runtime-cache';

const G = globalThis as Record<string, unknown>;

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v2/diagnostics', { headers });
}

function resetState() {
  _resetRuntimeControllerCache();
  resetCache();
  delete G.__V2_RUNTIME_STUB_DB__;
  delete G.__V2_RUNTIME_CONTROLLER_SNAPSHOT__;
  delete process.env.V2_RUNTIME_FORCE_MODE;
  delete process.env.V2_RUNTIME_FORCE_KILL;
  delete process.env.V2_GLOBAL_ONE_DEVICE_ENABLED;
  delete process.env.V2_CORS_ALLOWLIST_ENABLED;
  delete process.env.V2_WORKER_SECRET;
  delete process.env.INTERNAL_SYNC_SECRET;
}

describe('/api/v2/diagnostics', () => {
  beforeEach(resetState);
  afterEach(resetState);

  it('no secret → 401', async () => {
    delete process.env.V2_WORKER_SECRET;
    delete process.env.INTERNAL_SYNC_SECRET;
    const res = await GET(makeReq() as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('wrong secret → 401', async () => {
    process.env.V2_WORKER_SECRET = 'correct-secret';
    const res = await GET(
      makeReq({ 'x-v2-worker-secret': 'wrong-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(401);
  });

  it('valid x-v2-worker-secret → 200 with component "portal"', async () => {
    process.env.V2_WORKER_SECRET = 'correct-secret';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    const res = await GET(
      makeReq({ 'x-v2-worker-secret': 'correct-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.component).toBe('portal');
    expect(body.activeMode).toBe('v2');
    expect(body.killSwitch).toBe(false);
    expect(typeof body.source).toBe('string');
    expect(body.flags).toEqual({
      globalOneDevice: { configured: false, effective: false },
      corsAllowlist: { configured: false, effective: false },
    });
  });

  it('valid x-sync-secret (fallback header) → 200', async () => {
    process.env.INTERNAL_SYNC_SECRET = 'sync-secret';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    const res = await GET(
      makeReq({ 'x-sync-secret': 'sync-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.component).toBe('portal');
    expect(body.activeMode).toBe('v1');
  });

  it('POST works the same as GET', async () => {
    process.env.V2_WORKER_SECRET = 'correct-secret';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    const res = await POST(
      makeReq({ 'x-v2-worker-secret': 'correct-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.component).toBe('portal');
  });

  it('reports configured vs effective for globalOneDevice (v2 + flag on → effective true)', async () => {
    process.env.V2_WORKER_SECRET = 'correct-secret';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    const res = await GET(
      makeReq({ 'x-v2-worker-secret': 'correct-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flags.globalOneDevice.configured).toBe(true);
    expect(body.flags.globalOneDevice.effective).toBe(true);
  });

  it('reports configured true but effective false when V1 (restrict-only gate)', async () => {
    process.env.V2_WORKER_SECRET = 'correct-secret';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    const res = await GET(
      makeReq({ 'x-v2-worker-secret': 'correct-secret' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flags.globalOneDevice.configured).toBe(true);
    expect(body.flags.globalOneDevice.effective).toBe(false);
  });

  it('never echoes secret values in the response body', async () => {
    process.env.V2_WORKER_SECRET = 'super-secret-do-not-leak';
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    const res = await GET(
      makeReq({ 'x-v2-worker-secret': 'super-secret-do-not-leak' }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('super-secret-do-not-leak');
  });
});
