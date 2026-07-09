import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyStudentSession } from '@/lib/session';
import LoginMyCourses from './my-courses/login-my-courses';
import styles from './post/[id]/post.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('course_session_token')?.value || '';
  const session = verifyStudentSession(token);
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

  if (session) {
    redirect('/my-courses');
  }

  return (
    <main className={styles.container}>
      <LoginMyCourses clientId={googleClientId} />
    </main>
  );
}
