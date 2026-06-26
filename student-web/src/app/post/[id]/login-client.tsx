'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogOut } from 'lucide-react';
import styles from './post.module.css';

interface LoginClientProps {
  clientId: string;
  email?: string; // If logged in but unauthorized
}

export default function LoginClient({ clientId, email }: LoginClientProps) {
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
              console.error('Error during login api call:', err);
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className={styles.loginCard}>
      <div className={styles.lockContainer}>
        <Lock className={styles.lockIcon} size={48} />
      </div>
      <h2 className={styles.loginTitle}>Nội Dung Bảo Mật</h2>
      
      {email ? (
        <div className={styles.errorContent}>
          <p className={styles.loginText}>
            Tài khoản Gmail <strong style={{ color: 'var(--accent)' }}>{email}</strong> của bạn chưa được cấp quyền truy cập khóa học phụ này.
          </p>
          <p className={styles.loginTextSub}>
            Vui lòng liên hệ Admin để kiểm tra quyền học hoặc đăng nhập bằng tài khoản khác bên dưới.
          </p>
          
          <div className={styles.actionGroup}>
            <div ref={googleBtnRef} className={styles.googleBtn}></div>
            <button onClick={handleLogout} className={styles.logoutButton}>
              <LogOut size={16} /> Đăng xuất tài khoản
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className={styles.loginText}>
            Khóa học phụ này yêu cầu đăng nhập và phân quyền học viên từ hệ thống chính.
          </p>
          <p className={styles.loginTextSub}>
            Vui lòng đăng nhập bằng tài khoản Gmail đã đăng ký mua khóa học để tiếp tục xem nội dung.
          </p>
          <div className={styles.googleBtnCenter}>
            <div ref={googleBtnRef}></div>
          </div>
        </div>
      )}
    </div>
  );
}
