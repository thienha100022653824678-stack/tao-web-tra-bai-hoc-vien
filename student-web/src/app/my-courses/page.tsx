import React from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { verifyStudentSession } from '@/lib/session';
import { getMyCourses } from '@/lib/my-courses';

export const dynamic = 'force-dynamic';
import LoginMyCourses from './login-my-courses';
import MyCoursesClient from './my-courses-client';
import styles from '../post/[id]/post.module.css';

export default async function MyCoursesPage() {
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

  // 3. Fetch aggregated courses using the shared helper
  let combinedCourses: any[] = [];
  try {
    combinedCourses = await getMyCourses(email);
  } catch (err) {
    console.error('Error loading my courses:', err);
  }

  // 4. If logged in but has no courses/orders at all
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

  // 5. Render client portal with merged list
  return (
    <main className={styles.container}>
      <MyCoursesClient email={email} courses={combinedCourses} />
    </main>
  );
}
