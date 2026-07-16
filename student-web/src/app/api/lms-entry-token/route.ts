import { NextRequest, NextResponse } from 'next/server';
import { lmsSupabaseAdmin, supabaseAdmin } from '@/lib/supabase';
import { verifyStudentSession, AuthSecretError } from '@/lib/session';
import {
  PORTAL_DEVICE_COOKIE,
  createLmsEntryToken,
  ensureStudentSessionAtomic,
  ensureStudentSessionCompat,
  generateDeviceId,
} from '@/lib/session-guard';
import { warmRuntimeConfig } from '@/lib/v2-runtime-controller';
import { isV2GlobalOneDeviceEnabled } from '@/lib/v2-flags';

// LMS entry URL base. Env-overridable so preview/staging deploys can point at
// a different LMS host without a code change; the default preserves the
// existing V1 behavior exactly when the env is unset. Read lazily at request
// time (not module-load) so a runtime env change takes effect without a
// cold start.
const DEFAULT_LMS_ENTRY_BASE_URL = 'https://www.daubepnho.store/lms.html';
function getLmsEntryBaseUrl(): string {
  return process.env.LMS_ENTRY_BASE_URL || DEFAULT_LMS_ENTRY_BASE_URL;
}

const ACTIVE_ENROLLMENT_STATUSES = new Set([
  'active',
  'approved',
  'approved_ready',
  'approved_waiting_content',
  'completed',
]);

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatus(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAuthorizedEnrollmentStatus(value: unknown): boolean {
  return ACTIVE_ENROLLMENT_STATUSES.has(normalizeStatus(value));
}

function getRequestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }
  return request.headers.get('x-real-ip');
}

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, ...(code ? { code } : {}) }, { status });
}

function studentSessionError(error: unknown) {
  const code = (error as Error & { code?: string })?.code || (error as Error)?.message || '';
  if (code === 'student_session_guard_not_ready') {
    return jsonError('Hệ thống bảo vệ phiên học chưa được kích hoạt đầy đủ. Vui lòng liên hệ Admin.', 503);
  }
  if (code === 'existing_active_session' || code === 'active_session_on_another_device') {
    return jsonError(
      'Tài khoản này đang được sử dụng để học trên một thiết bị khác. Vui lòng đăng xuất khỏi thiết bị cũ trước khi đăng nhập trên thiết bị này.',
      409,
      'active_session_on_another_device'
    );
  }
  return jsonError('Không kiểm tra được phiên đăng nhập học viên. Vui lòng thử lại sau.', 500);
}

async function isEnrollmentAuthorized(email: string, courseSlug: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  const targetSlug = normalizeSlug(courseSlug);

  const [portalEnrollmentResult, lmsEnrollmentResult] = await Promise.all([
    supabaseAdmin
      .from('student_enrollments')
      .select('id, course_slug, status')
      .eq('email', cleanEmail),
    lmsSupabaseAdmin
      ? lmsSupabaseAdmin
          .from('student_enrollments')
          .select('id, course_slug, status')
          .eq('email', cleanEmail)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (portalEnrollmentResult.error || lmsEnrollmentResult.error) {
    throw new Error('Không kiểm tra được quyền học. Vui lòng thử lại sau.');
  }

  return [
    ...(portalEnrollmentResult.data || []),
    ...(lmsEnrollmentResult.data || []),
  ].some((row: { course_slug?: string; status?: string }) =>
    normalizeSlug(row.course_slug) === targetSlug
    && isAuthorizedEnrollmentStatus(row.status)
  );
}

async function validatePostCourse(postId: string | null, courseSlug: string): Promise<boolean> {
  if (!postId) return true;

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .select('id, course_slug')
    .eq('id', postId)
    .maybeSingle();

  if (error) {
    throw new Error('Không kiểm tra được bài học. Vui lòng thử lại sau.');
  }

  const postCourseSlug = String(post?.course_slug || '').trim();
  return Boolean(postCourseSlug)
    && normalizeSlug(postCourseSlug) === normalizeSlug(courseSlug);
}

export async function POST(request: NextRequest) {
  try {
    if (!lmsSupabaseAdmin) {
      return jsonError('Chưa cấu hình kết nối LMS. Vui lòng liên hệ Admin.', 500);
    }

    // Warm the V2 runtime cache once at the start of the request so the
    // synchronous gate (isV2GlobalOneDeviceEnabled) reflects the current
    // site_config mode for the rest of the invocation. Safe to call every
    // request — concurrent calls coalesce into one DB read. Never throws.
    await warmRuntimeConfig();

    const sessionToken = request.cookies.get('course_session_token')?.value || '';
    const session = verifyStudentSession(sessionToken);
    if (!session) {
      return jsonError('Bạn cần đăng nhập Gmail trước khi vào học.', 401);
    }

    const body = await request.json().catch(() => ({}));
    const courseSlug = String(body?.course_slug || '').trim();
    const postId = body?.post_id ? String(body.post_id).trim() : null;

    if (!courseSlug) {
      return jsonError('Thiếu mã khóa học.', 400);
    }

    const postMatchesCourse = await validatePostCourse(postId, courseSlug);
    if (!postMatchesCourse) {
      return jsonError('Bài học không khớp với khóa học.', 403);
    }

    const authorized = await isEnrollmentAuthorized(session.email, courseSlug);
    if (!authorized) {
      return jsonError('Gmail này chưa được cấp quyền học khóa này.', 403);
    }

    const existingDeviceId = request.cookies.get(PORTAL_DEVICE_COOKIE)?.value;
    const portalDeviceId = existingDeviceId || generateDeviceId('portal');
    const ip = getRequestIp(request);
    const userAgent = request.headers.get('user-agent');

    let studentGuardSession;
    try {
      // One-device routing — THE switch port:
      //   - V2 + V2_GLOBAL_ONE_DEVICE_ENABLED → atomic block path
      //     (ensureStudentSessionAtomic, RPC handle_student_session_login
      //     with p_conflict_policy:'block'). Block → 409
      //     active_session_on_another_device (preserved below).
      //   - V1 (or flag off, or kill switch on) → compat reuse path
      //     (ensureStudentSessionCompat): reuse latest active session, no
      //     blocking, no RPC. This preserves V1 behavior exactly.
      // The gate is restrict-only + fail-open-on-cold, so when site_config
      // is v1 (or lmsSupabaseAdmin not configured → fail-closed v1) the
      // compat path is selected regardless of the env flag.
      const useAtomicBlock = isV2GlobalOneDeviceEnabled();
      studentGuardSession = await (useAtomicBlock
        ? ensureStudentSessionAtomic({
            email: session.email,
            portalDeviceId,
            ip,
            userAgent,
            deviceLabel: userAgent ? userAgent.slice(0, 160) : null,
          })
        : ensureStudentSessionCompat({
            email: session.email,
            portalDeviceId,
            ip,
            userAgent,
          }));
    } catch (error) {
      return studentSessionError(error);
    }

    const { rawToken } = await createLmsEntryToken({
      email: session.email,
      studentSessionId: studentGuardSession.student_session_id,
      portalDeviceId: studentGuardSession.portal_device_id || portalDeviceId,
      courseSlug,
      postId,
      createdIp: ip,
      createdUserAgent: userAgent,
    });

    const url = `${getLmsEntryBaseUrl()}#entry_token=${encodeURIComponent(rawToken)}`;
    const response = NextResponse.json({ ok: true, url });

    if (!existingDeviceId) {
      response.cookies.set(PORTAL_DEVICE_COOKIE, portalDeviceId, {
        maxAge: 400 * 24 * 60 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return response;
  } catch (error) {
    // Fail-closed: a missing SESSION_SECRET throws AuthSecretError during
    // verifyStudentSession. Surface it as a 500 with the configured client
    // message (which never includes the secret value) instead of swallowing
    // it into the generic 500, so the misconfiguration is visible.
    if (error instanceof AuthSecretError) {
      return NextResponse.json(error.toClientJson(), { status: 500 });
    }
    return jsonError('Không tạo được link vào học. Vui lòng thử lại sau.', 500);
  }
}
