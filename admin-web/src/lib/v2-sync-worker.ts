// src/lib/v2-sync-worker.ts
//
// TS port of the worker-authorization subset of
// web-lms-chinh-thuc/utils/v2-sync-worker.js.
//
// Only the authorization helper is ported: the Admin diagnostics route is
// worker-secret gated (like /api/sync is sync-secret gated) so the same
// internal caller can reach it without the admin-session cookie. The full
// outbox/delivery worker is not part of the Admin component.

import crypto from 'crypto';

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

// env helper duplicated locally to keep this module dependency-free (mirrors
// the LMS file, which imports getV2Env from v2-flags). We intentionally read
// the env through the same helper so tests can stub process.env.
function getV2Env(name: string, fallback = ''): string {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

export function getV2SyncWorkerSecret(): string {
  return getV2Env('V2_WORKER_SECRET') || getV2Env('INTERNAL_SYNC_SECRET');
}

// Constant-time string compare. Returns false (without calling
// timingSafeEqual) when lengths differ, which leaks length — acceptable for
// shared secrets where length is not secret. On equal length it performs a
// timing-safe compare so the secret value is not recoverable via timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Next.js Request/Headers adapter: accept either a web Request (Headers) or
// a plain headers object. The diagnostics route passes a web Request.
export interface V2WorkerAuthorizable {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Assert that an inbound worker request is authorized. Reads
 * `V2_WORKER_SECRET` || `INTERNAL_SYNC_SECRET` and checks the
 * `x-v2-worker-secret` || `x-sync-secret` header. Throws an error with
 * `statusCode = 401` when the secret is missing or mismatches (fail-closed,
 * like /api/sync). Never throws on success.
 */
export function assertV2WorkerAuthorized(req: V2WorkerAuthorizable): void {
  const expectedSecret = getV2SyncWorkerSecret();
  const providedSecret = cleanText(
    req.headers.get('x-v2-worker-secret') || req.headers.get('x-sync-secret')
  );

  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    const error = new Error('Unauthorized V2 worker request');
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
}
