'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, ArrowLeft } from 'lucide-react';
import styles from './post.module.css';

interface LoginClientProps {
  clientId: string;
  email?: string; // If logged in but unauthorized
}

export default function LoginClient({ clientId, email }: LoginClientProps) {
  const router = useRouter();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [isInAppIOS, setIsInAppIOS] = React.useState(false);

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
    if (typeof window !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent;
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isZalo = /Zalo/i.test(ua);
      const isFB = /(FBAN|FBAV)/i.test(ua);
      if (isIOS && (isZalo || isFB)) {
        setIsInAppIOS(true);
      }
    }
  }, []);

  useEffect(() => {
    if (isInAppIOS) return;

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
            width: 280,
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
  }, [clientId, router, isInAppIOS]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <>
      <style>{`
        @keyframes floatArrow {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(4px, -4px) scale(1.15); }
        }
      `}</style>

      {isInAppIOS && (
        <div style={{
          position: 'fixed',
          top: '12px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          pointerEvents: 'none'
        }}>
          {/* Arrow pointing up-right */}
          <div style={{
            fontSize: '2rem',
            lineHeight: '1',
            color: '#fbbf24',
            animation: 'floatArrow 0.8s infinite alternate ease-in-out',
            marginBottom: '4px'
          }}>
            ↗️
          </div>
          <div style={{
            background: '#fbbf24',
            color: '#000',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap'
          }}>
            Bấm dấu ⋯ ở đây
          </div>
        </div>
      )}

      <div className={styles.loginCard} style={{ maxWidth: '440px', padding: '2rem 1.5rem', background: '#0e1217', borderColor: '#1f2937', borderRadius: '16px', margin: '40px auto', textAlign: 'center' }}>
        {email ? (
          // State 2: Logged in but unauthorized (wrong Gmail)
          <div>
            <div style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>🔒</div>
            <h2 className={styles.loginTitle} style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 800 }}>
              Gmail này chưa được cấp quyền
            </h2>
            <p className={styles.loginText} style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
              Bạn đang đăng nhập bằng:<br/>
              <strong style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{email}</strong>
            </p>

            {isInAppIOS ? (
              <p style={{ fontSize: '0.85rem', color: '#f87171', margin: '1rem 0', lineHeight: '1.4' }}>
                Vui lòng bấm dấu ⋯ ở góc trên bên phải → chọn "Mở bằng Safari" để chuyển đổi tài khoản Gmail khác.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', margin: '1.5rem 0' }}>
                <div ref={googleBtnRef} className={styles.googleBtn} style={{ minHeight: '44px' }}>
                  <div style={{ background: '#1a73e8', color: '#fff', padding: '10px 20px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: '280px' }}>
                    Đăng nhập tài khoản khác...
                  </div>
                </div>
                <button onClick={handleLogout} className={styles.logoutButton} style={{ marginTop: '0.25rem' }}>
                  <LogOut size={14} /> Đăng xuất tài khoản
                </button>
              </div>
            )}
          </div>
        ) : (
          // State 1: Not logged in
          <div>
            {isInAppIOS ? (
              <div>
                <div style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>🔒</div>
                <h2 className={styles.loginTitle} style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 800 }}>
                  Nội dung khóa học cần mở bằng Safari
                </h2>
                <p className={styles.loginText} style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  Bạn đang mở link trong Zalo/Facebook. Vui lòng mở bằng Safari hoặc trình duyệt ngoài để đăng nhập Gmail.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>🔒</div>
                <h2 className={styles.loginTitle} style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 800 }}>
                  Nội dung khóa học cần đăng nhập
                </h2>
                <p className={styles.loginText} style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  Vui lòng đăng nhập đúng Gmail đã mua khóa học để xem bài học.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0' }}>
                  <div ref={googleBtnRef} className={styles.googleBtn} style={{ minHeight: '44px' }}>
                    <div style={{ background: '#1a73e8', color: '#fff', padding: '10px 20px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: '280px' }}>
                      Đăng nhập bằng Google
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Browser Helper Box */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', marginTop: '1.5rem' }}>
          <div style={{ fontWeight: 'bold', color: '#fbbf24', fontSize: '0.85rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            💡 Đang mở trong Zalo/Facebook?
          </div>
          {isInAppIOS ? (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.45', marginBottom: '12px' }}>
              Bấm dấu <strong style={{ color: '#fff' }}>⋯</strong> ở góc trên bên phải → chọn <strong style={{ color: '#fff' }}>“Mở bằng Safari”</strong> hoặc <strong style={{ color: '#fff' }}>“Mở bằng trình duyệt”</strong> để đăng nhập Gmail.
            </p>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.45', marginBottom: '12px' }}>
              Bấm dấu <strong style={{ color: '#fff' }}>⋯</strong> ở góc trên bên phải → chọn <strong style={{ color: '#fff' }}>“Mở bằng trình duyệt”</strong> hoặc <strong style={{ color: '#fff' }}>“Open in browser”</strong>.
            </p>
          )}
          <button onClick={handleCopy} className={styles.secondaryHelperBtn} style={{ width: '100%', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
            {copied ? '✅ Đã copy link!' : '📋 Copy link bài học'}
          </button>
        </div>

        {/* Auxiliary Nav Links */}
        <div style={{ marginTop: '1.5rem' }}>
          <Link href="/" className={styles.secondaryHelperBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '0.6rem', fontSize: '0.8rem', background: 'transparent', borderColor: 'rgba(255,255,255,0.08)' }}>
            <ArrowLeft size={14} /> Quay về Trang chủ
          </Link>
        </div>
      </div>
    </>
  );
}
