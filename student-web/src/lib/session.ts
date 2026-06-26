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

function sessionSecrets(): string[] {
  return [
    process.env.SESSION_SECRET,
    process.env.GOOGLE_CLIENT_ID,
    'fallback-session-secret'
  ]
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter((s, idx, self) => s && self.indexOf(s) === idx);
}

function sessionSecret(): string {
  return sessionSecrets()[0] || 'fallback-session-secret';
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payloadBase64: string, secret: string = sessionSecret()): string {
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
  const validSignature = sessionSecrets().some(secret => {
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
