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
  
  const [copied, setCopied] = React.useState(false);
  const [os, setOs] = React.useState<'ios' | 'android' | 'other'>('other');
  const [isInAppBrowser, setIsInAppBrowser] = React.useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/i.test(ua);
      const isAndroid = /Android/i.test(ua);
      setOs(isIos ? 'ios' : isAndroid ? 'android' : 'other');

      const inApp = /zalo|fbav|fban|messenger|instagram|line|micromessenger/i.test(ua);
      setIsInAppBrowser(inApp);
    }
  }, []);

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

  const handleOpenBrowser = () => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      if (os === 'android') {
        const cleanUrl = currentUrl.replace(/^https?:\/\//, '');
        window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      } else {
        alert(
          "Để mở bằng Safari:\n" +
          "1. Bấm nút ⋯ (3 chấm) ở góc trên bên phải màn hình.\n" +
          "2. Chọn 'Mở bằng trình duyệt' (hoặc 'Mở bằng Safari').\n\n" +
          "Nếu không tự mở được, hãy bấm nút 'Copy link bài học' bên dưới rồi dán vào trình duyệt Safari."
        );
      }
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

      {/* Trình duyệt in-app / Hướng dẫn cho người lớn tuổi */}
      <div className={styles.browserHelperContainer}>
        <div className={styles.helperHeader}>
          <span className={styles.helperWarningIcon}>⚠️</span>
          <strong>Bạn đang mở bài học từ Zalo / Facebook?</strong>
        </div>
        <p className={styles.helperText}>
          Trình duyệt của Zalo/Facebook không hỗ trợ đăng nhập Gmail bảo mật. Hãy mở bài bằng Safari hoặc Chrome để xem bài:
        </p>
        
        <div className={styles.helperButtons}>
          <button onClick={handleOpenBrowser} className={styles.primaryHelperBtn}>
            {os === 'ios' ? 'Mở bằng Safari' : os === 'android' ? 'Mở bằng Chrome' : 'Mở bằng trình duyệt ngoài'}
          </button>
          
          <button onClick={handleCopy} className={styles.secondaryHelperBtn}>
            {copied ? '✅ Đã copy link!' : '📋 Copy link bài học'}
          </button>
        </div>

        <div className={styles.helperGuide}>
          <p><strong>Hướng dẫn mở nhanh:</strong> Bấm dấu <strong>⋯</strong> (ở góc trên cùng bên phải) → Chọn <strong>"Mở bằng trình duyệt"</strong> (hoặc <strong>"Open in browser"</strong> / <strong>"Mở bằng Safari"</strong>).</p>
          <p style={{ marginTop: '5px' }}>Nếu nút không tự mở được, hãy bấm nút <strong>Copy link bài học</strong> ở trên rồi mở Safari/Chrome trên máy và dán vào thanh địa chỉ.</p>
        </div>
      </div>
    </div>
  );
}
