'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Search, Info, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inputValue.trim()) {
      setError('Vui lòng nhập liên kết hoặc mã bài viết');
      return;
    }

    // Try to extract UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)
    // UUID v4 format regex
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = inputValue.match(uuidRegex);

    if (match) {
      const postId = match[0];
      router.push(`/post/${postId}`);
    } else {
      setError('Mã bài viết không đúng định dạng (UUID). Vui lòng kiểm tra lại liên kết.');
    }
  };

  return (
    <main className={styles.container}>
      <div className={`${styles.card} glass animate-fade-in`}>
        <div className={styles.logoContainer}>
          <GraduationCap size={32} />
        </div>
        
        <h1 className={styles.title}>Cổng Trả Bài Học Viên</h1>
        <p className={styles.description}>
          Hệ thống lưu trữ và trả bài tập dành riêng cho học viên. Để bảo mật thông tin, vui lòng nhập mã bài viết hoặc liên kết bạn nhận được từ giảng viên để xem nội dung.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Nhập liên kết hoặc mã bài tập</label>
          <div className={styles.inputWrapper}>
            <Search className={styles.inputIcon} size={18} />
            <input
              type="text"
              placeholder="Ví dụ: https://.../post/uuid hoặc mã UUID"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError('');
              }}
              className={styles.input}
            />
          </div>
          {error && <span className={styles.error}>{error}</span>}
          
          <button type="submit" className={styles.button}>
            Xem bài học <ArrowRight size={18} />
          </button>
        </form>

        <div className={styles.infoBox}>
          <Info className={styles.infoIcon} size={18} />
          <p>
            Mỗi bài tập bao gồm hình ảnh thành phẩm, công thức chi tiết và lượt xem công khai. Bạn không cần đăng nhập vẫn có thể xem nội dung nếu có liên kết chính xác.
          </p>
        </div>
      </div>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} Cổng Học Viên. All rights reserved.
      </footer>
    </main>
  );
}
