import crypto from 'crypto';
import { lmsSupabaseAdmin } from './supabase';
import { normalizeEmail } from './session';

const ACTIVE_STUDENT_STATUS = 'active';
const ACTIVE_ENTRY_TOKEN_STATUS = 'active';

export const PORTAL_DEVICE_COOKIE = 'portal_device_id';
export const DEFAULT_LMS_ENTRY_TOKEN_TTL_MINUTES = 30;
export const DEFAULT_STUDENT_SESSION_IDLE_HOURS = 24;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLmsEntryTokenTtlMinutes(): number {
  return positiveNumber(
    process.env.LMS_ENTRY_TOKEN_TTL_MINUTES,
    DEFAULT_LMS_ENTRY_TOKEN_TTL_MINUTES
  );
}

export function getStudentSessionIdleHours(): number {
  return positiveNumber(
    process.env.STUDENT_SESSION_IDLE_HOURS,
    DEFAULT_STUDENT_SESSION_IDLE_HOURS
  );
}

export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

export function generateSessionId(prefix = 'student'): string {
  return `${prefix}_${generateSecureToken(32)}`;
}

export function generateDeviceId(prefix = 'portal'): string {
  return `${prefix}_${generateSecureToken(24)}`;
}

export function hashToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('rawToken is required');
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function assertLmsSupabase() {
  if (!lmsSupabaseAdmin) {
    throw new Error('LMS Supabase is not configured');
  }
  return lmsSupabaseAdmin;
}

async function throwIfSupabaseError<T>(result: { data: T; error: unknown }): Promise<T> {
  if (result.error) throw result.error;
  return result.data;
}

export type StudentGuardSession = {
  id: string;
  email: string;
  student_session_id: string;
  portal_device_id: string;
  status: string;
  last_seen_at: string;
};

export type EntryTokenResult = {
  rawToken: string;
  tokenHash: string;
  entryToken: {
    id: string;
    email: string;
    student_session_id: string;
    portal_device_id: string;
    course_slug: string;
    post_id: string | null;
    status: string;
    expires_at: string;
  };
};

export async function getActiveStudentSessionByEmail(email: string): Promise<StudentGuardSession | null> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const data = await throwIfSupabaseError(await supabase
    .from('student_active_sessions')
    .select('id,email,student_session_id,portal_device_id,status,last_seen_at')
    .eq('email', cleanEmail)
    .eq('status', ACTIVE_STUDENT_STATUS)
    .order('last_seen_at', { ascending: false })
    .limit(1));

  return (data?.[0] as StudentGuardSession | undefined) || null;
}

export async function touchStudentSession(studentSessionId: string): Promise<StudentGuardSession | null> {
  const supabase = assertLmsSupabase();
  if (!studentSessionId) throw new Error('studentSessionId is required');

  const data = await throwIfSupabaseError(await supabase
    .from('student_active_sessions')
    .update({
      last_seen_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('student_session_id', studentSessionId)
    .eq('status', ACTIVE_STUDENT_STATUS)
    .select('id,email,student_session_id,portal_device_id,status,last_seen_at')
    .maybeSingle());

  return (data as StudentGuardSession | null) || null;
}

export async function createStudentActiveSession(params: {
  email: string;
  portalDeviceId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<StudentGuardSession> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(params.email);
  if (!cleanEmail) throw new Error('email is required');
  if (!params.portalDeviceId) throw new Error('portalDeviceId is required');

  const data = await throwIfSupabaseError(await supabase
    .from('student_active_sessions')
    .insert({
      email: cleanEmail,
      student_session_id: generateSessionId('student'),
      portal_device_id: params.portalDeviceId,
      status: ACTIVE_STUDENT_STATUS,
      ip: params.ip || null,
      user_agent: params.userAgent || null,
    })
    .select('id,email,student_session_id,portal_device_id,status,last_seen_at')
    .single());

  return data as StudentGuardSession;
}

export async function ensureStudentSessionCompat(params: {
  email: string;
  portalDeviceId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<StudentGuardSession> {
  // Observe/compat mode: reuse the latest active session for this Gmail if present.
  // Enforcement for one Gmail = one device will be enabled in a later step.
  const existing = await getActiveStudentSessionByEmail(params.email);
  if (existing) {
    return (await touchStudentSession(existing.student_session_id)) || existing;
  }

  return createStudentActiveSession(params);
}

export async function createLmsEntryToken(params: {
  email: string;
  studentSessionId: string;
  portalDeviceId: string;
  courseSlug: string;
  postId?: string | null;
  createdIp?: string | null;
  createdUserAgent?: string | null;
  ttlMinutes?: number;
}): Promise<EntryTokenResult> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(params.email);
  const cleanCourseSlug = String(params.courseSlug || '').trim();
  if (!cleanEmail) throw new Error('email is required');
  if (!params.studentSessionId) throw new Error('studentSessionId is required');
  if (!params.portalDeviceId) throw new Error('portalDeviceId is required');
  if (!cleanCourseSlug) throw new Error('courseSlug is required');

  const rawToken = generateSecureToken(48);
  const tokenHash = hashToken(rawToken);
  const data = await throwIfSupabaseError(await supabase
    .from('lms_entry_tokens')
    .insert({
      token_hash: tokenHash,
      email: cleanEmail,
      student_session_id: params.studentSessionId,
      portal_device_id: params.portalDeviceId,
      course_slug: cleanCourseSlug,
      post_id: params.postId || null,
      status: ACTIVE_ENTRY_TOKEN_STATUS,
      expires_at: addMinutesIso(params.ttlMinutes || getLmsEntryTokenTtlMinutes()),
      created_ip: params.createdIp || null,
      created_user_agent: params.createdUserAgent || null,
    })
    .select('id,email,student_session_id,portal_device_id,course_slug,post_id,status,expires_at')
    .single());

  return {
    rawToken,
    tokenHash,
    entryToken: data as EntryTokenResult['entryToken'],
  };
}
