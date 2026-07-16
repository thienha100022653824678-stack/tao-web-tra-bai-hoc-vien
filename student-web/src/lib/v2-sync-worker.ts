// src/lib/v2-sync-worker.ts
//
// V2 worker authorization helper for the Portal. TypeScript port of the
// worker-secret gate from the LMS `utils/v2-sync-worker.js`
// (`assertV2WorkerAuthorized`). Used by the diagnostics route to gate
// access to runtime-mode + flag posture introspection.
//
// The Portal does NOT run the V2 outbox sync worker itself (the LMS does);
// this module exists only to provide the same worker-secret gate the
// diagnostics endpoint needs, so only the trusted sync worker (or an
// operator with the secret) can read the runtime posture. The secret is
// read from V2_WORKER_SECRET (preferred) or INTERNAL_SYNC_SECRET (fallback),
// and the request must supply it via the `x-v2-worker-secret` or
// `x-sync-secret` header. Missing/mismatched → 401.

import crypto from 'crypto';
import { getV2Env } from './v2-flags';

export function getV2SyncWorkerSecret(): string {
  return getV2Env('V2_WORKER_SECRET') || getV2Env('INTERNAL_SYNC_SECRET');
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

// Constant-time string compare. Returns false (without calling
// timingSafeEqual) when lengths differ, which leaks length — acceptable for
// shared secrets where length is not secret. On equal length it performs a
// timing-safe compare so the secret value itself is not recoverable via a
// timing side-channel.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

type HeaderLike = Record<string, string | string[] | undefined> | Headers;

function readHeader(headers: HeaderLike | undefined, name: string): string {
  if (!headers) return '';
  // Headers (Web fetch / NextRequest) — case-insensitive get().
  if (typeof (headers as Headers).get === 'function') {
    return cleanText((headers as Headers).get(name));
  }
  // Plain object — do a case-insensitive lookup.
  const lower = name.toLowerCase();
  const obj = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === lower) {
      const v = obj[key];
      return cleanText(Array.isArray(v) ? v[0] : v);
    }
  }
  return '';
}

export class V2WorkerAuthError extends Error {
  statusCode = 401;
  constructor(message = 'Unauthorized V2 worker request') {
    super(message);
    this.name = 'V2WorkerAuthError';
  }
}

/**
 * Assert the incoming request is authorized as the V2 sync worker. Reads
 * `V2_WORKER_SECRET` (preferred) or `INTERNAL_SYNC_SECRET` and compares it
 * (timing-safe) to the `x-v2-worker-secret` or `x-sync-secret` header.
 * Throws `V2WorkerAuthError` (statusCode 401) when the secret is unset or
 * the provided value does not match.
 */
export function assertV2WorkerAuthorized(req: {
  headers?: HeaderLike;
}): void {
  const expectedSecret = getV2SyncWorkerSecret();
  const providedSecret =
    readHeader(req.headers, 'x-v2-worker-secret') ||
    readHeader(req.headers, 'x-sync-secret');

  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    throw new V2WorkerAuthError();
  }
}
