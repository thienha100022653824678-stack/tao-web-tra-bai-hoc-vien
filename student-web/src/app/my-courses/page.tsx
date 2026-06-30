import React from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { verifyStudentSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import LoginMyCourses from './login-my-courses';
import MyCoursesClient from './my-courses-client';
import styles from '../post/[id]/post.module.css';

interface PageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function MyCoursesPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const queryEmail = (resolvedParams.email || '').trim().toLowerCase();

  const cookieStore = await cookies();
  const token = cookieStore.get('course_session_token')?.value || '';
  const session = verifyStudentSession(token);
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

  // 1. If not authenticated, render login page
  if (!session) {
    return (
      <main className={styles.container}>
        <LoginMyCourses clientId={googleClientId} />
      </main>
    );
  }

  const email = session.email.trim().toLowerCase();

  // 2. Clear session function
  const handleLogoutAction = async () => {
    'use server';
    const store = await cookies();
    store.delete('course_session_token');
  };

  // 3. Step 4: If Gmail logged-in mismatch queryEmail
  if (queryEmail && email !== queryEmail) {
    return (
      <main className={styles.container}>
        <div className={styles.loginCard} style={{ margin: '60px auto', maxWidth: '480px' }}>
          <div className={styles.lockContainer} style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24' }}>
            <AlertTriangle size={40} style={{ color: '#fbbf24' }} />
          </div>
          <h2 className={styles.loginTitle} style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>
            Bạn đang đăng nhập bằng Gmail khác với Gmail đã dùng để đăng ký khóa học.
          </h2>
          <p className={styles.loginText} style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontSize: '0.9rem' }}>
            Tài khoản hiện tại: <strong>{email}</strong><br/>
            Gmail đã dùng đăng ký: <strong>{queryEmail}</strong>
          </p>
          <p className={styles.loginTextSub} style={{ marginBottom: '25px', fontSize: '0.85rem' }}>
            Vui lòng đăng nhập đúng Gmail để xem khóa học.
          </p>
          
          <form action={handleLogoutAction} style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
            <button type="submit" className={styles.logoutButton} style={{ width: 'auto', background: 'rgba(255,255,255,0.05)' }}>
              Đăng xuất và dùng tài khoản khác
            </button>
          </form>

          <div style={{ marginTop: '30px' }}>
            <Link href="/" className={styles.homeButton} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <ArrowLeft size={16} /> Quay về Trang chủ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 4. Initialize Supabase B client to fetch pending orders
  const supabaseBUrl = process.env.SUPABASE_B_URL || 'https://aqozjkfwzmyfunqvcyjv.supabase.co';
  const supabaseBServiceKey = process.env.SUPABASE_B_SERVICE_ROLE_KEY || '';
  
  let pendingOrders: any[] = [];
  let bCourses: any[] = [];
  
  if (supabaseBServiceKey) {
    const supabaseB = createClient(supabaseBUrl, supabaseBServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Fetch all pending orders for this customer from Supabase B
    const { data: ords } = await supabaseB
      .from('orders')
      .select('course_slug, course_title, created_at, status')
      .eq('customer_email', email)
      .eq('status', 'Chờ duyệt');

    if (ords) pendingOrders = ords;

    // Fetch course details (like title and imageUrl) from Supabase B
    const { data: crs } = await supabaseB
      .from('courses')
      .select('slug, title, raw_data');
      
    if (crs) bCourses = crs;
  }

  const courseMap = new Map<string, { title: string; imageUrl: string }>();
  if (bCourses) {
    for (const c of bCourses) {
      const raw = c.raw_data || {};
      courseMap.set(c.slug.trim(), {
        title: c.title || raw.title || c.slug,
        imageUrl: raw.imageUrl || raw.bannerImageUrl || raw.heroImageUrl || ''
      });
    }
  }

  // 5. Fetch enrollments from Supabase A
  const { data: enrollments, error: enrollError } = await supabaseAdmin
    .from('student_enrollments')
    .select('course_slug, created_at, status')
    .eq('email', email)
    .eq('status', 'active');

  if (enrollError) {
    console.error('Error fetching student enrollments:', enrollError);
  }

  const activeSlugs = (enrollments || [])
    .map(e => String(e.course_slug || '').trim())
    .filter(Boolean);

  let posts: any[] = [];

  // 6. Fetch posts (lessons/content) for active courses in Supabase A
  if (activeSlugs.length > 0) {
    const { data: pts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('id, title, course_slug, created_at, images')
      .in('course_slug', activeSlugs);

    if (postsError) {
      console.error('Error fetching posts for courses:', postsError);
    }
    if (pts) posts = pts;
  }

  // 7. Combine datasets into unified courses list
  const combinedCourses: any[] = [];

  // Active Slug Set to filter pending orders
  const activeSlugsSet = new Set(activeSlugs);

  // Add pending orders
  for (const order of pendingOrders) {
    const slug = String(order.course_slug || '').trim();
    if (activeSlugsSet.has(slug)) continue; // already active

    const courseDetails = courseMap.get(slug);
    combinedCourses.push({
      id: `pending-${slug}`,
      title: courseDetails?.title || order.course_title || slug,
      course_slug: slug,
      status: 'pending_order',
      grantedAt: order.created_at,
      images: courseDetails?.imageUrl ? [courseDetails.imageUrl] : []
    });
  }

  // Add active enrollments (either approved_waiting_content or approved_ready)
  const slugToEnrollment = new Map(
    enrollments?.map(e => [String(e.course_slug || '').trim(), e])
  );

  const postsBySlug = new Map<string, any[]>();
  for (const post of posts) {
    const slug = String(post.course_slug || '').trim();
    if (!postsBySlug.has(slug)) {
      postsBySlug.set(slug, []);
    }
    postsBySlug.get(slug)!.push(post);
  }

  for (const slug of activeSlugs) {
    const enrollment = slugToEnrollment.get(slug);
    const slugPosts = postsBySlug.get(slug) || [];
    const courseDetails = courseMap.get(slug);

    if (slugPosts.length > 0) {
      // TRẠNG THÁI 3: approved_ready
      const mainPost = slugPosts[0];
      combinedCourses.push({
        id: mainPost.id,
        title: courseDetails?.title || mainPost.title || slug,
        course_slug: slug,
        status: 'approved_ready',
        grantedAt: enrollment?.created_at || mainPost.created_at,
        images: mainPost.images || (courseDetails?.imageUrl ? [courseDetails.imageUrl] : [])
      });
    } else {
      // TRẠNG THÁI 2: approved_waiting_content
      combinedCourses.push({
        id: `waiting-${slug}`,
        title: courseDetails?.title || slug,
        course_slug: slug,
        status: 'approved_waiting_content',
        grantedAt: enrollment?.created_at,
        images: courseDetails?.imageUrl ? [courseDetails.imageUrl] : []
      });
    }
  }

  // 8. If logged in but has no courses/orders at all
  if (combinedCourses.length === 0) {
    return (
      <main className={styles.container}>
        <div className={styles.loginCard} style={{ margin: '60px auto' }}>
          <div className={styles.lockContainer} style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' }}>
            <AlertTriangle size={40} style={{ color: '#ef4444' }} />
          </div>
          <h2 className={styles.loginTitle}>Chưa Có Quyền Truy Cập</h2>
          <p className={styles.loginText} style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
            Tài khoản Gmail <strong>{email}</strong> của bạn chưa được cấp quyền khóa học nào.
          </p>
          <p className={styles.loginTextSub} style={{ marginBottom: '25px' }}>
            Vui lòng đăng ký mua khóa học hoặc liên hệ trực tiếp với giảng viên để được phê duyệt truy cập.
          </p>
          
          <form action={handleLogoutAction} style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
            <button type="submit" className={styles.logoutButton} style={{ width: 'auto', background: 'rgba(255,255,255,0.05)' }}>
              Đăng xuất và dùng tài khoản khác
            </button>
          </form>

          <div style={{ marginTop: '30px' }}>
            <Link href="/" className={styles.homeButton} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <ArrowLeft size={16} /> Quay về Trang chủ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 9. Render client portal with merged list
  return (
    <main className={styles.container}>
      <MyCoursesClient email={email} courses={combinedCourses} />
    </main>
  );
}
