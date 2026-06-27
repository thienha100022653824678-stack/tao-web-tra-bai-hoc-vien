'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import styles from './post.module.css';

interface LoginClientProps {
  clientId: string;
  email?: string; // If logged in but unauthorized
}

export default function LoginClient({ clientId, email }: LoginClientProps) {
  const router = useRouter();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          const el = document.createElement('textarea');
          el.value = window.location.href;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    }
  };

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
    <div style={{ marginTop: '20px', width: '100%' }}>
      {email ? (
        <div className={styles.errorContent}>
          <p className={styles.loginText}>
            Tài khoản Gmail <strong style={{ color: 'var(--accent)' }}>{email}</strong> của bạn chưa được cấp quyền truy cập khóa học này.
          </p>
          <p className={styles.loginTextSub} style={{ marginBottom: '15px' }}>
            Vui lòng liên hệ Admin hoặc đăng nhập bằng tài khoản khác bên dưới.
          </p>
          
          <div className={styles.actionGroup} style={{ marginTop: '10px' }}>
            <div ref={googleBtnRef} className={styles.googleBtn}></div>
            <button onClick={handleLogout} className={styles.logoutButton}>
              <LogOut size={16} /> Đăng xuất tài khoản
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div ref={googleBtnRef}></div>
        </div>
      )}

      {/* Trình duyệt in-app / Hướng dẫn đơn giản cho người cao tuổi */}
      <div className={styles.browserHelperContainer} style={{ marginTop: '25px' }}>
        <div className={styles.helperHeader} style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
          <strong>💡 Hướng dẫn mở nhanh trên điện thoại:</strong>
        </div>
        <p className={styles.helperText} style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '12px' }}>
          Bấm dấu <strong>⋯</strong> (ở góc trên cùng bên phải) → Chọn <strong>"Mở bằng trình duyệt"</strong> (hoặc <strong>"Open in browser"</strong> / <strong>"Mở bằng Safari"</strong>).
        </p>
        
        <button onClick={handleCopy} className={styles.secondaryHelperBtn} style={{ width: '100%', padding: '0.65rem' }}>
          {copied ? '✅ Đã copy link!' : '📋 Copy link bài học'}
        </button>
      </div>
    </div>
  );
}
