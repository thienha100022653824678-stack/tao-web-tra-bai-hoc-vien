// tests/session-secret-fail-closed.test.ts
//
// SESSION_SECRET fail-closed. Asserts the Portal no longer silently falls
// back to a literal 'fallback-session-secret'. Missing SESSION_SECRET in
// production runtime must throw AuthSecretError (mirrors LMS RP-1).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuthSecretError,
  createStudentSession,
  verifyStudentSession
} from '../src/lib/session';

// @types/node declares NODE_ENV as readonly on ProcessEnv; cast to a mutable
// record for test-only env mutation.
const env = process.env as Record<string, string | undefined>;

const ORIG_SESSION = env.SESSION_SECRET;
const ORIG_GOOGLE = env.GOOGLE_CLIENT_ID;
const ORIG_BYPASS = env.LMS_RP1_ALLOW_INSECURE_LOCAL;
const ORIG_NODE = env.NODE_ENV;
const ORIG_VERCEL = env.VERCEL_ENV;

function resetEnv() {
  // Restore original ambient env so tests do not leak into each other.
  if (ORIG_SESSION === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = ORIG_SESSION;
  if (ORIG_GOOGLE === undefined) delete env.GOOGLE_CLIENT_ID;
  else env.GOOGLE_CLIENT_ID = ORIG_GOOGLE;
  if (ORIG_BYPASS === undefined) delete env.LMS_RP1_ALLOW_INSECURE_LOCAL;
  else env.LMS_RP1_ALLOW_INSECURE_LOCAL = ORIG_BYPASS;
  if (ORIG_NODE === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = ORIG_NODE;
  if (ORIG_VERCEL === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = ORIG_VERCEL;
}

describe('SESSION_SECRET fail-closed', () => {
  beforeEach(() => {
    delete env.SESSION_SECRET;
    delete env.GOOGLE_CLIENT_ID;
    delete env.LMS_RP1_ALLOW_INSECURE_LOCAL;
    env.NODE_ENV = 'production';
    delete env.VERCEL_ENV;
  });
  afterEach(resetEnv);

  it('createStudentSession throws AuthSecretError when SESSION_SECRET is missing', () => {
    expect(() => createStudentSession('student@example.com')).toThrow(AuthSecretError);
    try {
      createStudentSession('student@example.com');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthSecretError);
      const e = err as AuthSecretError;
      expect(e.code).toBe('auth_misconfigured');
      expect(e.missingEnvVars).toContain('SESSION_SECRET');
      // Never includes the secret value (there is none) and never mentions the
      // legacy literal fallback.
      expect(e.message).not.toMatch(/fallback-session-secret/);
      expect(e.exposesValues).toBe(false);
    }
  });

  it('verifyStudentSession throws AuthSecretError when SESSION_SECRET is missing', () => {
    // Even with a well-formed token, a missing secret must fail-closed.
    expect(() => verifyStudentSession('abc.def')).toThrow(AuthSecretError);
  });

  it('no literal fallback-session-secret is accepted as a valid signer', () => {
    // Sign with the literal that used to be the silent fallback, then set a
    // real SESSION_SECRET and confirm the literal-signed token is rejected.
    // (We cannot call createStudentSession with the literal because the
    // module no longer exposes a path that uses it.)
    env.SESSION_SECRET = 'real-session-secret';
    const { token } = createStudentSession('student@example.com');
    // Token signed with the real secret verifies.
    expect(verifyStudentSession(token)?.email).toBe('student@example.com');
    // A token forged with the old literal must NOT verify.
    const crypto = require('crypto') as typeof import('crypto');
    const payload = Buffer.from(JSON.stringify({
      email: 'forged@example.com',
      exp: Date.now() + 60_000
    })).toString('base64url');
    const forgedSig = crypto
      .createHmac('sha256', 'fallback-session-secret')
      .update(payload)
      .digest('base64url');
    const forged = `${payload}.${forgedSig}`;
    expect(verifyStudentSession(forged)).toBe(null);
  });

  it('with SESSION_SECRET set, create + verify round-trip works', () => {
    env.SESSION_SECRET = 'real-session-secret';
    const { token, expiresAt } = createStudentSession('Student@Example.com');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(2);
    expect(expiresAt).toBeGreaterThan(Date.now());
    const session = verifyStudentSession(token);
    expect(session).not.toBe(null);
    expect(session!.email).toBe('student@example.com'); // normalized
  });

  it('AuthSecretError.toClientJson never includes secret values', () => {
    const err = new AuthSecretError('Missing required auth configuration: SESSION_SECRET', ['SESSION_SECRET']);
    const json = err.toClientJson();
    expect(json.ok).toBe(false);
    expect(json.code).toBe('auth_misconfigured');
    expect(json.missingEnvVars).toEqual(['SESSION_SECRET']);
    expect(JSON.stringify(json)).not.toMatch(/fallback-session-secret/);
  });

  it('local bypass (LMS_RP1_ALLOW_INSECURE_LOCAL=1, non-prod) allows signing without SESSION_SECRET', () => {
    env.NODE_ENV = 'development';
    env.LMS_RP1_ALLOW_INSECURE_LOCAL = '1';
    delete env.SESSION_SECRET;
    // Must not throw; must produce a token that verifies against the same
    // synthetic local-bypass secret.
    const { token } = createStudentSession('student@example.com');
    expect(verifyStudentSession(token)?.email).toBe('student@example.com');
  });

  it('local bypass is refused in production even if the flag is set', () => {
    env.NODE_ENV = 'production';
    env.LMS_RP1_ALLOW_INSECURE_LOCAL = '1';
    delete env.SESSION_SECRET;
    expect(() => createStudentSession('student@example.com')).toThrow(AuthSecretError);
  });
});
