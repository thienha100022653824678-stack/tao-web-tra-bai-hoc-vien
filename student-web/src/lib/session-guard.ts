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

export function hashOptionalValue(value?: string | null): string | null {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return null;
  return crypto.createHash('sha256').update(cleanValue).digest('hex');
}

export const ACCOUNT_SHARING_EVENT_TYPES = {
  PORTAL_SESSION_CREATED: 'portal_session_created',
  PORTAL_SESSION_REUSED: 'portal_session_reused',
  LOGIN_BLOCKED_OTHER_DEVICE: 'login_blocked_other_device',
  ENTRY_TOKEN_CREATED: 'entry_token_created',
  LOGOUT: 'logout',
} as const;

const ACCOUNT_SHARING_RISK_POINTS: Record<string, number> = {
  [ACCOUNT_SHARING_EVENT_TYPES.LOGIN_BLOCKED_OTHER_DEVICE]: 25,
  [ACCOUNT_SHARING_EVENT_TYPES.PORTAL_SESSION_CREATED]: 3,
  [ACCOUNT_SHARING_EVENT_TYPES.PORTAL_SESSION_REUSED]: 0,
  [ACCOUNT_SHARING_EVENT_TYPES.ENTRY_TOKEN_CREATED]: 1,
  [ACCOUNT_SHARING_EVENT_TYPES.LOGOUT]: 4,
};

export async function logStudentDeviceEvent(params: {
  email: string;
  eventType: string;
  action?: string;
  courseSlug?: string | null;
  postId?: string | null;
  oldDeviceHash?: string | null;
  newDeviceHash?: string | null;
  oldDeviceLabel?: string | null;
  newDeviceLabel?: string | null;
  oldStudentSessionId?: string | null;
  newStudentSessionId?: string | null;
  portalDeviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(params.email);
  const eventType = String(params.eventType || '').trim();
  if (!cleanEmail || !eventType) return;

  const { error } = await supabase
    .from('student_device_change_logs')
    .insert({
      email: cleanEmail,
      action: params.action || eventType,
      event_type: eventType,
      course_slug: params.courseSlug || null,
      post_id: params.postId || null,
      old_device_hash: params.oldDeviceHash || null,
      new_device_hash: params.newDeviceHash || hashOptionalValue(params.portalDeviceId),
      old_device_label: params.oldDeviceLabel || null,
      new_device_label: params.newDeviceLabel || null,
      old_student_session_id: params.oldStudentSessionId || null,
      new_student_session_id: params.newStudentSessionId || null,
      user_agent: params.userAgent || null,
      ip_hash: hashOptionalValue(params.ip),
      reason: params.reason || null,
      event_source: 'portal',
      risk_points: ACCOUNT_SHARING_RISK_POINTS[eventType] || 0,
      metadata: params.metadata || {},
    });

  if (error) {
    console.warn('[account-sharing] Could not write portal event:', error.message);
  }
}

async function safeLogStudentDeviceEvent(params: Parameters<typeof logStudentDeviceEvent>[0]): Promise<void> {
  try {
    await logStudentDeviceEvent(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.warn('[account-sharing] Portal event skipped:', message);
  }
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

export async function markStudentSessionLoggedOut(params: {
  email: string;
  portalDeviceId?: string | null;
  studentSessionId?: string | null;
}): Promise<StudentGuardSession | null> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(params.email);
  if (!cleanEmail) throw new Error('email is required');
  if (!params.portalDeviceId && !params.studentSessionId) {
    throw new Error('portalDeviceId or studentSessionId is required');
  }

  let query = supabase
    .from('student_active_sessions')
    .select('id,email,student_session_id,portal_device_id,status,last_seen_at')
    .eq('email', cleanEmail)
    .eq('status', ACTIVE_STUDENT_STATUS)
    .limit(1);

  if (params.studentSessionId) {
    query = query.eq('student_session_id', params.studentSessionId);
  } else if (params.portalDeviceId) {
    query = query.eq('portal_device_id', params.portalDeviceId);
  }

  const existingRows = await throwIfSupabaseError(await query);
  const existing = existingRows?.[0] as StudentGuardSession | undefined;
  if (!existing) return null;

  const logoutAt = nowIso();
  const loggedOutSession = await throwIfSupabaseError(await supabase
    .from('student_active_sessions')
    .update({
      status: 'logged_out',
      logout_at: logoutAt,
      updated_at: logoutAt,
    })
    .eq('student_session_id', existing.student_session_id)
    .eq('status', ACTIVE_STUDENT_STATUS)
    .select('id,email,student_session_id,portal_device_id,status,last_seen_at')
    .maybeSingle());

  await throwIfSupabaseError(await supabase
    .from('lms_verified_sessions')
    .update({
      status: 'logged_out',
      logout_at: logoutAt,
      updated_at: logoutAt,
    })
    .eq('student_session_id', existing.student_session_id)
    .eq('status', ACTIVE_STUDENT_STATUS));

  await throwIfSupabaseError(await supabase
    .from('lms_entry_tokens')
    .update({ status: 'revoked' })
    .eq('student_session_id', existing.student_session_id)
    .eq('status', ACTIVE_ENTRY_TOKEN_STATUS));

  void safeLogStudentDeviceEvent({
    email: cleanEmail,
    eventType: ACCOUNT_SHARING_EVENT_TYPES.LOGOUT,
    oldDeviceHash: hashOptionalValue(existing.portal_device_id),
    oldStudentSessionId: existing.student_session_id,
    portalDeviceId: existing.portal_device_id,
    reason: 'student_logout',
  });

  return (loggedOutSession as StudentGuardSession | null) || existing;
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

export async function ensureStudentSessionAtomic(params: {
  email: string;
  portalDeviceId: string;
  ip?: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
}): Promise<StudentGuardSession> {
  const supabase = assertLmsSupabase();
  const cleanEmail = normalizeEmail(params.email);
  if (!cleanEmail) throw new Error('email is required');
  if (!params.portalDeviceId) throw new Error('portalDeviceId is required');

  const newStudentSessionId = generateSessionId('student');
  const rpcResult = await supabase.rpc('handle_student_session_login', {
    p_email: cleanEmail,
    p_portal_device_id: params.portalDeviceId,
    p_new_student_session_id: newStudentSessionId,
    p_device_hash: hashOptionalValue(params.portalDeviceId),
    p_device_label: params.deviceLabel || null,
    p_ip: params.ip || null,
    p_ip_hash: hashOptionalValue(params.ip),
    p_user_agent: params.userAgent || null,
    p_conflict_policy: 'block',
    p_idle_hours: getStudentSessionIdleHours(),
  });

  if (rpcResult.error) {
    const message = String(rpcResult.error.message || '');
    if (/function .*handle_student_session_login|schema cache|does not exist/i.test(message)) {
      throw new Error('student_session_guard_not_ready');
    }
    throw rpcResult.error;
  }

  const data = (rpcResult.data || {}) as {
    ok?: boolean;
    action?: string;
    reason?: string;
    email?: string;
    student_session_id?: string;
    portal_device_id?: string;
  };

  if (!data.ok) {
    void safeLogStudentDeviceEvent({
      email: cleanEmail,
      eventType: ACCOUNT_SHARING_EVENT_TYPES.LOGIN_BLOCKED_OTHER_DEVICE,
      oldDeviceHash: hashOptionalValue(data.portal_device_id),
      newDeviceHash: hashOptionalValue(params.portalDeviceId),
      oldStudentSessionId: data.student_session_id || null,
      portalDeviceId: params.portalDeviceId,
      newDeviceLabel: params.deviceLabel || null,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      reason: data.reason || 'student_session_blocked',
      metadata: {
        rpcAction: data.action || 'blocked',
      },
    });
    const error = new Error(data.reason || 'student_session_blocked');
    (error as Error & { code?: string; action?: string }).code = data.reason || 'student_session_blocked';
    (error as Error & { code?: string; action?: string }).action = data.action || 'blocked';
    throw error;
  }

  void safeLogStudentDeviceEvent({
    email: data.email || cleanEmail,
    eventType: data.action === 'reused'
      ? ACCOUNT_SHARING_EVENT_TYPES.PORTAL_SESSION_REUSED
      : ACCOUNT_SHARING_EVENT_TYPES.PORTAL_SESSION_CREATED,
    newDeviceHash: hashOptionalValue(data.portal_device_id || params.portalDeviceId),
    newDeviceLabel: params.deviceLabel || null,
    newStudentSessionId: data.student_session_id || newStudentSessionId,
    portalDeviceId: data.portal_device_id || params.portalDeviceId,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
    metadata: {
      rpcAction: data.action || 'created',
    },
  });

  return {
    id: '',
    email: data.email || cleanEmail,
    student_session_id: data.student_session_id || newStudentSessionId,
    portal_device_id: data.portal_device_id || params.portalDeviceId,
    status: ACTIVE_STUDENT_STATUS,
    last_seen_at: nowIso(),
  };
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

  void safeLogStudentDeviceEvent({
    email: cleanEmail,
    eventType: ACCOUNT_SHARING_EVENT_TYPES.ENTRY_TOKEN_CREATED,
    courseSlug: cleanCourseSlug,
    postId: params.postId || null,
    newDeviceHash: hashOptionalValue(params.portalDeviceId),
    newStudentSessionId: params.studentSessionId,
    portalDeviceId: params.portalDeviceId,
    ip: params.createdIp || null,
    userAgent: params.createdUserAgent || null,
  });

  return {
    rawToken,
    tokenHash,
    entryToken: data as EntryTokenResult['entryToken'],
  };
}
