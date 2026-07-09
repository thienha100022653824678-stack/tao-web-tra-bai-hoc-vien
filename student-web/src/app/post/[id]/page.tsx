import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { ArrowLeft, Calendar, Eye, AlertTriangle, Lock, GraduationCap } from 'lucide-react';
import { lmsSupabaseAdmin, supabase, supabaseAdmin } from '@/lib/supabase';
import { verifyStudentSession, isAdminEmail } from '@/lib/session';
import { ImageGallery, RecipeCardWrapper, ViewTracker } from './components';
import LoginClient from './login-client';
import MarkAsViewed from './mark-viewed';
import OriginalLessonButton from './original-lesson-button';
import styles from './post.module.css';

interface PostPageProps {
  params: Promise<{
    id: string;
  }>;
}

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
  return new Set([
    'active',
    'approved',
    'approved_ready',
    'approved_waiting_content',
    'completed',
  ]).has(normalizeStatus(value));
}

export default async function PostDetail({ params }: PostPageProps) {
  const { id } = await params;

  // Fetch post data on the server
  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !post) {
    console.error('Error fetching post:', error);
    return (
      <main className={styles.container}>
        <div className={`${styles.errorCard} glass animate-fade-in`}>
          <AlertTriangle className={styles.errorIcon} size={64} />
          <h2 className={styles.errorTitle}>Không Tìm Thấy Bài Viết</h2>
          <p className={styles.errorText}>
            Liên kết này không chính xác hoặc bài viết đã bị gỡ bỏ bởi giảng viên. 
            Vui lòng kiểm tra lại liên kết hoặc liên hệ trực tiếp để được hỗ trợ.
          </p>
          <Link href="/" className={styles.homeButton}>
            <ArrowLeft size={18} /> Quay về Trang chủ
          </Link>
        </div>
      </main>
    );
  }

  console.log('STUDENT_WEB_SYNC_DEBUG:', {
    postId: id,
    postTitle: post?.title,
    postCourseSlug: post?.course_slug,
    hasPost: !!post,
    fetchError: error
  });

  // ── Gating Checks (Phân quyền khóa học phụ) ──
  const courseSlug = post.course_slug;
  let studentFacingTitle = String(post.title || '').trim();
  if (courseSlug && lmsSupabaseAdmin) {
    const [lmsCourseResult, configResult] = await Promise.all([
      lmsSupabaseAdmin
        .from('courses')
        .select('title, raw_data')
        .ilike('slug', courseSlug.trim())
        .maybeSingle(),
      lmsSupabaseAdmin
        .from('site_config')
        .select('value')
        .eq('key', `${courseSlug.trim()}_studentDisplayTitle`)
        .maybeSingle()
    ]);

    const lmsCourse = lmsCourseResult.data;
    const configRow = configResult.data;

    if (lmsCourseResult.error) {
      console.error('STUDENT_WEB_LMS_COURSE_TITLE_ERROR:', lmsCourseResult.error);
    }
    if (configResult.error) {
      console.error('STUDENT_WEB_LMS_CONFIG_TITLE_ERROR:', configResult.error);
    }

    const rawDataTitle = String((lmsCourse?.raw_data as any)?.studentDisplayTitle || '').trim();
    const courseFieldTitle = String((lmsCourse as any)?.studentDisplayTitle || '').trim();
    const configTitle = String((configRow?.value as any)?.val || '').trim();
    const courseTitle = String(lmsCourse?.title || '').trim();

    studentFacingTitle = 
      rawDataTitle || 
      courseFieldTitle || 
      configTitle || 
      courseTitle || 
      String(post.title || '').trim();
  }
  let isAuthorized = true;
  let sessionEmail = '';

  if (courseSlug) {
    const cookieStore = await cookies();
    
    // 1. Bypass check if current user is System 1 Admin
    const adminSession = cookieStore.get('admin-session')?.value;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = crypto.createHash('sha256').update(adminPassword).digest('hex');
    const isAdmin = adminSession === hash;

    console.log('STUDENT_WEB_GATING_CHECK_START:', {
      courseSlug,
      isAdmin,
      adminSessionLength: adminSession ? adminSession.length : 0
    });

    if (!isAdmin) {
      // 2. Validate student session
      const token = cookieStore.get('course_session_token')?.value || '';
      const session = verifyStudentSession(token);

      console.log('STUDENT_WEB_SESSION_VAL:', {
        hasToken: !!token,
        hasSession: !!session,
        sessionEmail: session?.email
      });

      if (!session) {
        isAuthorized = false;
      } else {
        sessionEmail = session.email;
        const isLmsAdmin = isAdminEmail(sessionEmail);
        if (!isLmsAdmin) {
          const targetSlug = normalizeSlug(courseSlug);
          const cleanEmail = sessionEmail.trim().toLowerCase();
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

          if (portalEnrollmentResult.error) {
            console.error('STUDENT_WEB_PORTAL_ENROLLMENT_ERROR:', portalEnrollmentResult.error);
          }
          if (lmsEnrollmentResult.error) {
            console.error('STUDENT_WEB_LMS_ENROLLMENT_ERROR:', lmsEnrollmentResult.error);
          }

          const enrollment = [
            ...(portalEnrollmentResult.data || []),
            ...(lmsEnrollmentResult.data || []),
          ].find((row: any) =>
            normalizeSlug(row.course_slug) === targetSlug
            && isAuthorizedEnrollmentStatus(row.status)
          );

          console.log('STUDENT_WEB_ENROLLMENT_VAL:', {
            hasEnrollment: !!enrollment,
            enrollmentStatus: enrollment?.status,
            checkedCourseSlug: targetSlug
          });

          if (!enrollment) {
            isAuthorized = false;
          }
        }
      }
    }
  }

  console.log('STUDENT_WEB_GATING_CHECK_END:', {
    isAuthorized,
    sessionEmail
  });

  if (!isAuthorized) {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    return (
      <main className={styles.container}>
        <LoginClient clientId={googleClientId} email={sessionEmail || undefined} />
      </main>
    );
  }

  // Format date
  const formattedDate = new Date(post.created_at).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });


  // Construct media list (prepend hero_media_url to images)
  const mediaList: string[] = [];
  if (post.hero_media_url && post.hero_media_url.trim()) {
    mediaList.push(post.hero_media_url.trim());
  }
  if (post.images && post.images.length > 0) {
    const cleanImages = post.images.map((img: any) => String(img || '').trim()).filter(Boolean);
    mediaList.push(...cleanImages);
  }

  const isShopAdmin = post.source === 'shop_admin' || (post.source !== 'main_admin' && post.course_slug !== null);

  return (
    <div className={isShopAdmin ? styles.shopLandingWrapper : ''}>
      <main className={styles.container}>
        {/* ViewTracker to record view count on mount */}
        <ViewTracker postId={id} />
        <MarkAsViewed postId={id} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <Link href="/" className={styles.backButton} style={{ marginBottom: 0 }}>
            <ArrowLeft size={16} /> Quay lại cổng học viên
          </Link>
          <Link href="/my-courses" className={styles.backButton} style={{ marginBottom: 0, color: isShopAdmin ? '#D96B27' : 'var(--accent)' }}>
            <GraduationCap size={16} /> Khóa học của tôi
          </Link>
        </div>

        <div className={`${styles.grid} animate-fade-in`}>
          {/* Left Column: Image/Video Gallery */}
          <ImageGallery images={mediaList} />

          {/* Right Column: Title and Recipe details */}
          <div className={styles.infoSection}>
            <div className={styles.header}>
              <div className={styles.meta}>
                <div className={styles.metaItem}>
                  <Calendar size={16} style={{ color: isShopAdmin ? '#D96B27' : 'var(--accent)' }} />
                  <span>{formattedDate}</span>
                </div>
                {/* Chỉ hiển thị badge lượt xem nếu course_slug là NULL (bài public) */}
                {!courseSlug && (
                  <div className={`${styles.metaItem} ${styles.viewsBadge}`}>
                    <Eye size={16} />
                    <span>{post.views} lượt xem</span>
                  </div>
                )}
              </div>
              <h1 className={styles.title} style={{ marginBottom: courseSlug ? '0.75rem' : '0' }}>{studentFacingTitle || post.title}</h1>
              
              {/* Hiển thị nút bài học gốc LMS nếu có course_slug */}
              {courseSlug && (
                <OriginalLessonButton courseSlug={courseSlug.trim()} postId={id} />
              )}
            </div>

            {/* Recipe Card */}
            <RecipeCardWrapper title={studentFacingTitle || post.title} recipe={post.recipe} />
          </div>
        </div>
      </main>
    </div>
  );
}
