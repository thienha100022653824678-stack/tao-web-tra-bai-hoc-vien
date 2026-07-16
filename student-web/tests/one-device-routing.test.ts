// tests/one-device-routing.test.ts
//
// One-device routing — THE switch port. Asserts the lms-entry-token route
// picks the session strategy by mode:
//   - V2 + V2_GLOBAL_ONE_DEVICE_ENABLED → ensureStudentSessionAtomic (block)
//   - V1 (or flag off, or kill switch on) → ensureStudentSessionCompat (V1
//     reuse path, no block)
//
// We mock session-guard to record which strategy was selected, and drive the
// route via a minimal NextRequest-like object. No network / no real DB.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Which session strategy was last selected by the route.
let lastStrategy: 'atomic' | 'compat' | null = null;
const resetStrategy = () => { lastStrategy = null; };

// Mock session-guard: both ensure* fns record the selection and return a
// minimal session object. createLmsEntryToken returns a dummy token.
vi.mock('../src/lib/session-guard', () => ({
  PORTAL_DEVICE_COOKIE: 'portal_device_id',
  DEFAULT_LMS_ENTRY_TOKEN_TTL_MINUTES: 30,
  DEFAULT_STUDENT_SESSION_IDLE_HOURS: 24,
  ACCOUNT_SHARING_SCHEMA_VERSION: 'v2',
  generateDeviceId: () => 'portal_test_device',
  ensureStudentSessionAtomic: vi.fn(async () => {
    lastStrategy = 'atomic';
    return {
      id: '1',
      email: 'student@example.com',
      student_session_id: 'sess_atomic',
      portal_device_id: 'portal_test_device',
      status: 'active',
      last_seen_at: new Date().toISOString(),
    };
  }),
  ensureStudentSessionCompat: vi.fn(async () => {
    lastStrategy = 'compat';
    return {
      id: '1',
      email: 'student@example.com',
      student_session_id: 'sess_compat',
      portal_device_id: 'portal_test_device',
      status: 'active',
      last_seen_at: new Date().toISOString(),
    };
  }),
  createLmsEntryToken: vi.fn(async () => ({
    rawToken: 'entrytoken_test',
    tokenHash: 'hash_test',
    entryToken: {
      id: 'tok1',
      email: 'student@example.com',
      student_session_id: 'sess_compat',
      portal_device_id: 'portal_test_device',
      course_slug: 'khoa-hoc',
      post_id: null,
      status: 'active',
      expires_at: new Date().toISOString(),
    },
  })),
}));

// Mock supabase: lmsSupabaseAdmin present (route gates on it being non-null),
// supabaseAdmin returns authorized enrollments + a matching post. The query
// builders are chainable AND thenable (supabase builders resolve to
// {data, error} when awaited), so isEnrollmentAuthorized sees an authorized
// row for `khoa-hoc` and the route reaches the session-strategy branch.
vi.mock('../src/lib/supabase', () => {
  const authorizedRow = { id: 'e1', course_slug: 'khoa-hoc', status: 'active' };
  const postRow = { id: 'p1', course_slug: 'khoa-hoc' };
  // A thenable that resolves to {data, error}; also exposes chainable
  // .maybeSingle()/.single()/.in() for supabase query builders.
  function builder(result: { data: unknown; error: unknown }) {
    const then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return {
      then,
      maybeSingle: () => builder({
        data: Array.isArray(result.data) ? (result.data as unknown[])[0] ?? null : result.data,
        error: result.error,
      }),
      single: () => builder({
        data: Array.isArray(result.data) ? (result.data as unknown[])[0] ?? null : result.data,
        error: result.error,
      }),
      in: () => builder(result),
    };
  }
  const fakeClient = {
    from: (table: string) => ({
      select: () => {
        const data =
          table === 'student_enrollments' ? [authorizedRow]
          : table === 'posts' ? [postRow]
          : table === 'site_config' ? [] // empty → db_default → v1
          : [];
        const b = builder({ data, error: null });
        return { eq: () => b, in: () => b };
      },
      insert: () => ({ select: () => ({ single: () => builder({ data: {}, error: null }) }) }),
      update: () => ({ eq: () => builder({ data: {}, error: null }) }),
    }),
  };
  return {
    supabase: fakeClient,
    supabaseAdmin: fakeClient,
    lmsSupabaseAdmin: fakeClient,
  };
});

import { POST } from '../src/app/api/lms-entry-token/route';
import { _resetRuntimeControllerCache } from '../src/lib/v2-runtime-controller';
import { _resetForTest as resetCache } from '../src/lib/v2-runtime-cache';
import { createStudentSession } from '../src/lib/session';

const G = globalThis as Record<string, unknown>;

function makeRequest(body: unknown, sessionToken: string): Request {
  return new Request('http://localhost/api/lms-entry-token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `course_session_token=${sessionToken}; portal_device_id=portal_test_device`,
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'test-agent',
    },
    body: JSON.stringify(body),
  });
}

async function callRoute(body: unknown, sessionToken: string) {
  const req = makeRequest(body, sessionToken);
  // NextRequest extends Request; the route uses request.cookies.get(),
  // request.headers.get(), request.json(). NextRequest cookies API is not
  // available on a bare Request, so wrap with a minimal shim.
  const cookieMap = new Map<string, string>();
  const cookieHeader = req.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) cookieMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  const wrapped = {
    method: 'POST',
    headers: req.headers,
    json: () => req.json(),
    cookies: {
      get: (name: string) => {
        const v = cookieMap.get(name);
        return v ? { value: v } : undefined;
      },
    },
  };
  // The route uses NextResponse.json + response.cookies.set; the test only
  // cares about status + body, so call POST and read the returned Response.
  // Cast to any because our shim is not a full NextRequest.
  return POST(wrapped as unknown as import('next/server').NextRequest);
}

function resetState() {
  _resetRuntimeControllerCache();
  resetCache();
  delete G.__V2_RUNTIME_STUB_DB__;
  delete G.__V2_RUNTIME_CONTROLLER_SNAPSHOT__;
  delete process.env.V2_RUNTIME_FORCE_MODE;
  delete process.env.V2_RUNTIME_FORCE_KILL;
  delete process.env.V2_GLOBAL_ONE_DEVICE_ENABLED;
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.LMS_ENTRY_BASE_URL = 'https://www.daubepnho.store/lms.html';
  resetStrategy();
}

describe('one-device routing (lms-entry-token)', () => {
  beforeEach(resetState);
  afterEach(resetState);

  it('V2 + flag ON → atomic block path (ensureStudentSessionAtomic)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    expect(lastStrategy).toBe('atomic');
  });

  it('V1 → compat reuse path (no block)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1'; // flag on but V1 → still compat
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    expect(lastStrategy).toBe('compat');
  });

  it('V2 but flag OFF → compat reuse path (V1 behavior preserved)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '0' };
    delete process.env.V2_GLOBAL_ONE_DEVICE_ENABLED;
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    expect(lastStrategy).toBe('compat');
  });

  it('kill switch on → compat reuse path (forces V1)', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v2', v2_kill_switch: '1' };
    process.env.V2_GLOBAL_ONE_DEVICE_ENABLED = '1';
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    expect(lastStrategy).toBe('compat');
  });

  it('cold cache (no warm yet) + flag OFF env → compat (V1 preserved, fail-open does not enable atomic)', async () => {
    // No stub, no env override, lmsSupabaseAdmin mocked non-null. The route
    // warms from the mocked supabase which returns empty data → db_default →
    // v1. Even though fail-open-on-cold would let the flag through, the
    // route warms BEFORE reading the flag, so the gate is resolved (v1) and
    // the compat path is selected. V1 behavior preserved.
    delete process.env.V2_GLOBAL_ONE_DEVICE_ENABLED;
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    expect(lastStrategy).toBe('compat');
  });

  it('LMS_ENTRY_BASE_URL env override is reflected in the returned url', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    process.env.LMS_ENTRY_BASE_URL = 'https://override.example.com/lms.html';
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain('https://override.example.com/lms.html');
  });

  it('V1 default LMS_ENTRY_BASE_URL preserved when env unset', async () => {
    G.__V2_RUNTIME_STUB_DB__ = { v2_active_mode: 'v1', v2_kill_switch: '0' };
    delete process.env.LMS_ENTRY_BASE_URL;
    const { token } = createStudentSession('student@example.com');
    const res = await callRoute({ course_slug: 'khoa-hoc' }, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain('https://www.daubepnho.store/lms.html');
  });
});
