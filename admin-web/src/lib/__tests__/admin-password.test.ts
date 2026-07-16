import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Ensure the Web Crypto subtle digest used by the login route/middleware is
// available (Node 18+ exposes it on globalThis.crypto; vitest node env should
// too, but be explicit).
if (!globalThis.crypto) {
  (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

// Read the source as text and assert the weak default is gone. We import the
// route module fresh per env state, so we isolate the env by deleting
// ADMIN_PASSWORD and reloading.
async function importLogin() {
  return import('@/app/api/auth/login/route');
}

function jsonRequest(body: unknown, init?: { headers?: Record<string, string> }): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body),
  });
}

const ENV_KEYS = ['ADMIN_PASSWORD', 'NODE_ENV'];

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
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ADMIN_PASSWORD fail-closed — source has no weak default', () => {
  const saved = snapshotEnv();
  beforeEach(() => delete process.env.ADMIN_PASSWORD);
  afterEach(() => restoreEnv(saved));

  it('login route source does not contain the admin123 default', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/auth/login/route.ts'),
      'utf8'
    );
    expect(src).not.toContain("|| 'admin123'");
    // The new fail-closed guard message must be present.
    expect(src).toContain('Hệ thống chưa cấu hình mật khẩu quản trị (ADMIN_PASSWORD)');
  });

  it('middleware source does not contain the admin123 default', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../middleware.ts'),
      'utf8'
    );
    expect(src).not.toContain("|| 'admin123'");
    // Must read ADMIN_PASSWORD without a fallback default.
    expect(src).toContain('process.env.ADMIN_PASSWORD');
  });
});

describe('ADMIN_PASSWORD fail-closed — login route behavior', () => {
  const saved = snapshotEnv();
  afterEach(() => restoreEnv(saved));

  it('returns 500 config error when ADMIN_PASSWORD is unset (no zero-config login)', async () => {
    delete process.env.ADMIN_PASSWORD;
    const { POST } = await importLogin();
    const res = await POST(jsonRequest({ password: 'admin123' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('ADMIN_PASSWORD');
  });

  it('rejects the literal admin123 password when ADMIN_PASSWORD is unset', async () => {
    delete process.env.ADMIN_PASSWORD;
    const { POST } = await importLogin();
    const res = await POST(jsonRequest({ password: 'admin123' }));
    // Must NOT succeed — fail-closed config error (500), not 200.
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 for a wrong password when ADMIN_PASSWORD is set', async () => {
    process.env.ADMIN_PASSWORD = 'real-secret-xyz';
    const { POST } = await importLogin();
    const res = await POST(jsonRequest({ password: 'wrong' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('V1 preservation: login SUCCEEDS and sets cookie when ADMIN_PASSWORD is set + password matches', async () => {
    process.env.ADMIN_PASSWORD = 'real-secret-xyz';
    const { POST } = await importLogin();
    const res = await POST(jsonRequest({ password: 'real-secret-xyz' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Cookie set with the sha256(password) hex value.
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie.toLowerCase()).toContain('admin-session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('survives a non-JSON / invalid body without crashing (still fail-closed when unset)', async () => {
    delete process.env.ADMIN_PASSWORD;
    const { POST } = await importLogin();
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

describe('ADMIN_PASSWORD fail-closed — middleware treats unset as unauthenticated', () => {
  const saved = snapshotEnv();
  afterEach(() => restoreEnv(saved));

  async function runMiddleware(cookie: string | undefined) {
    vi.resetModules();
    const { middleware } = await import('@/middleware');
    const headers = new Headers();
    if (cookie !== undefined) headers.set('cookie', `admin-session=${cookie}`);
    const url = new URL('http://localhost/protected');
    // NextRequest exposes the cookies API the middleware reads.
    const { NextRequest } = await import('next/server');
    const nextReq = new NextRequest(url, {
      headers,
    });
    return middleware(nextReq);
  }

  it('with ADMIN_PASSWORD unset → redirect to /login (not authenticated), even with a cookie', async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await runMiddleware('anything');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('with ADMIN_PASSWORD unset + no cookie → redirect to /login', async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await runMiddleware(undefined);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('V1 preservation: with ADMIN_PASSWORD set + valid sha256 cookie → passes through (200)', async () => {
    process.env.ADMIN_PASSWORD = 'real-secret-xyz';
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode('real-secret-xyz'));
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const res = await runMiddleware(hex);
    expect(res.status).toBe(200);
  });

  it('with ADMIN_PASSWORD set + wrong cookie → redirect to /login', async () => {
    process.env.ADMIN_PASSWORD = 'real-secret-xyz';
    const res = await runMiddleware('wrong-cookie-value');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('diagnostics route is exempt: /api/v2/diagnostics passes through even when unauthenticated', async () => {
    delete process.env.ADMIN_PASSWORD;
    vi.resetModules();
    const { middleware } = await import('@/middleware');
    const { NextRequest } = await import('next/server');
    const url = new URL('http://localhost/api/v2/diagnostics');
    const res = await middleware(new NextRequest(url, { headers: new Headers() }));
    // Exempt → middleware passes through (NextResponse.next() → 200).
    expect(res.status).toBe(200);
  });
});
