'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import styles from './post.module.css';

interface OriginalLessonButtonProps {
  courseSlug: string;
  postId: string;
}

export default function OriginalLessonButton({ courseSlug, postId }: OriginalLessonButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleOpenLesson() {
    const cleanCourseSlug = courseSlug.trim();
    const cleanPostId = postId.trim();

    if (!cleanCourseSlug || !cleanPostId) {
      setError('Không tạo được liên kết vào lớp. Vui lòng đăng nhập đúng Gmail đã mua khóa học rồi thử lại.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/lms-entry-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_slug: cleanCourseSlug,
          post_id: cleanPostId,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data?.url) {
        setError('Không tạo được liên kết vào lớp. Vui lòng đăng nhập đúng Gmail đã mua khóa học rồi thử lại.');
        return;
      }

      window.location.assign(data.url);
    } catch {
      setError('Không tạo được liên kết vào lớp. Vui lòng đăng nhập đúng Gmail đã mua khóa học rồi thử lại.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.lmsLinkContainer}>
      <button
        type="button"
        className={styles.lmsLinkButton}
        onClick={handleOpenLesson}
        disabled={isLoading}
      >
        <GraduationCap size={16} />
        {isLoading ? 'Đang tạo liên kết...' : 'Bài học gốc phục vụ giảng dạy'}
      </button>
      {error ? (
        <p className={styles.lmsLinkError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
