'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldAlert, Loader2 } from 'lucide-react';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Vui lòng nhập mật khẩu quản trị');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Redirect to dashboard
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Mật khẩu không đúng. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Login request error:', err);
      setError('Đã xảy ra lỗi kết nối. Vui lòng kiểm tra lại mạng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <div className={`${styles.card} glass animate-fade-in`}>
        <div className={styles.iconWrapper}>
          <Lock size={28} />
        </div>
        
        <h1 className={styles.title}>Hệ thống Quản trị</h1>
        <p className={styles.subtitle}>Vui lòng nhập mật khẩu cấu hình để tiếp tục quản lý các trang trả bài học viên.</p>

        <form onSubmit={handleLogin} className={styles.form}>
          <label className={styles.label}>Mật khẩu quản trị</label>
          <div className={styles.inputWrapper}>
            <Lock className={styles.inputIcon} size={18} />
            <input
              type="password"
              placeholder="Nhập mật khẩu..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              className={styles.input}
              disabled={loading}
            />
          </div>
          {error && <span className={styles.error}>{error}</span>}

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Đang đăng nhập...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
