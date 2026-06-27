'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import styles from '../post/[id]/post.module.css';

interface LoginMyCoursesProps {
  clientId: string;
}

export default function LoginMyCourses({ clientId }: LoginMyCoursesProps) {
  const router = useRouter();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (typeof window !== 'undefined' && (window as any).google) {
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            try {
              const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
              });
              const data = await res.json();
              if (data.success) {
                router.refresh();
              } else {
                alert(data.error || 'Đăng nhập thất bại');
              }
            } catch (err) {
              console.error('Error during login:', err);
            }
          },
        });

        if (googleBtnRef.current) {
          google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_blue',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
          });
        }
      }
    };

    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {
        // Ignore script removal errors
      }
    };
  }, [clientId, router]);

  return (
    <div className={styles.loginCard} style={{ margin: '60px auto' }}>
      <div className={styles.lockContainer} style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.25)', color: '#3b82f6' }}>
        <GraduationCap size={40} style={{ color: '#3b82f6' }} />
      </div>
      <h2 className={styles.loginTitle}>Cổng Học Viên</h2>
      <p className={styles.loginText} style={{ marginBottom: '20px' }}>
        Đăng nhập bằng tài khoản Google đã mua khóa học để tra cứu và vào học các bài giảng của bạn.
      </p>
      
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
        <div ref={googleBtnRef}></div>
      </div>
    </div>
  );
}
