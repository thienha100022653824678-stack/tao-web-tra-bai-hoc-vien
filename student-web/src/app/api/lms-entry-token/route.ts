import { NextRequest, NextResponse } from 'next/server';
import { lmsSupabaseAdmin, supabaseAdmin } from '@/lib/supabase';
import { verifyStudentSession } from '@/lib/session';
import {
  PORTAL_DEVICE_COOKIE,
  createLmsEntryToken,
  ensureStudentSessionCompat,
  generateDeviceId,
} from '@/lib/session-guard';

const LMS_ENTRY_BASE_URL = 'https://www.daubepnho.store/lms.html';

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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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

    const studentGuardSession = await ensureStudentSessionCompat({
      email: session.email,
      portalDeviceId,
      ip,
      userAgent,
    });

    const { rawToken } = await createLmsEntryToken({
      email: session.email,
      studentSessionId: studentGuardSession.student_session_id,
      portalDeviceId: studentGuardSession.portal_device_id || portalDeviceId,
      courseSlug,
      postId,
      createdIp: ip,
      createdUserAgent: userAgent,
    });

    const url = `${LMS_ENTRY_BASE_URL}?entry_token=${encodeURIComponent(rawToken)}`;
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
  } catch {
    return jsonError('Không tạo được link vào học. Vui lòng thử lại sau.', 500);
  }
}
