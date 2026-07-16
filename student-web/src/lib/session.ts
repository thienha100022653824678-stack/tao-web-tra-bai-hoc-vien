import crypto from 'crypto';

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(normalizeEmail(email));
}

// AuthSecretError intentionally does NOT include the secret value.
// It exposes only the variable name(s) so operators know what to configure.
// Mirrors the LMS RP-1 `utils/lms-secrets.js` fail-closed pattern.
export class AuthSecretError extends Error {
  readonly code = 'auth_misconfigured';
  readonly exposesValues = false;
  readonly missingEnvVars: string[];
  constructor(message: string, missingEnvVars: string[] = []) {
    super(message);
    this.name = 'AuthSecretError';
    this.missingEnvVars = Array.isArray(missingEnvVars) ? missingEnvVars.slice() : [];
  }

  toClientJson() {
    return {
      ok: false,
      code: this.code,
      error: 'Authentication is temporarily unavailable. Please retry later.',
      missingEnvVars: this.missingEnvVars
    };
  }
}

const SESSION_SECRET_ENV = 'SESSION_SECRET';

// Modules that intentionally bypass fail-closed (e.g. tests). Set
// LMS_RP1_ALLOW_INSECURE_LOCAL=1 to allow missing required secrets during
// development. In production the env var must be unset OR explicitly set to
// "1" AND NODE_ENV must not be "production".
function isLocalBypassAllowed(): boolean {
  const flag = String(process.env.LMS_RP1_ALLOW_INSECURE_LOCAL || '').trim();
  if (flag !== '1') return false;
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return false;
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production') return false;
  return true;
}

function readSecret(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string') return '';
  return value.trim();
}

// Get the primary session signing secret. Throws AuthSecretError (fail-closed)
// when SESSION_SECRET is missing in production runtime — NEVER silently falls
// back to a literal. In local-only bypass mode, returns a clearly-marked
// synthetic value so any signature generated here is recognizable as such.
function getSessionSecret(): string {
  const value = readSecret(SESSION_SECRET_ENV);
  if (value) return value;
  if (isLocalBypassAllowed()) {
    return `__local_bypass__${SESSION_SECRET_ENV}__not_for_production__`;
  }
  throw new AuthSecretError(
    `Missing required auth configuration: ${SESSION_SECRET_ENV}`,
    [SESSION_SECRET_ENV]
  );
}

// Secondary verification secrets. SESSION_SECRET is the primary signer and
// the only one that can fail-closed; GOOGLE_CLIENT_ID is kept ONLY as a
// legacy verification secret so tokens signed before the fail-closed
// cutover (or signed on an instance that still had it configured) remain
// verifiable. A missing SESSION_SECRET still throws via getSessionSecret().
function sessionVerifySecrets(): string[] {
  const primary = getSessionSecret();
  const secondary = readSecret('GOOGLE_CLIENT_ID');
  const secrets = [primary];
  if (secondary) secrets.push(secondary);
  return Array.from(new Set(secrets));
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payloadBase64: string, secret: string = getSessionSecret()): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');
}

export function verifyStudentSession(token: string) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  // Fail-closed: getSessionSecret() (via sessionVerifySecrets) throws
  // AuthSecretError when SESSION_SECRET is unset in production. We do NOT
  // catch it here — the caller (route handler) surfaces a 500/config error
  // rather than silently accepting a literal-signed token.
  const secrets = sessionVerifySecrets();
  const validSignature = secrets.some(secret => {
    const expectedSignature = signPayload(payloadBase64, secret);
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expectedSignature);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });

  if (!validSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp) return null;
    if (Date.now() > Number(payload.exp)) return null;

    return {
      email: normalizeEmail(payload.email),
      expiresAt: Number(payload.exp)
    };
  } catch {
    return null;
  }
}

export function createStudentSession(email: string) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = { email: normalizeEmail(email), exp: expiresAt };
  const payloadBase64 = base64url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);

  return {
    token: `${payloadBase64}.${signature}`,
    expiresAt
  };
}
