'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Search, GraduationCap, ArrowRight, BookOpen } from 'lucide-react';
import styles from '../post/[id]/post.module.css';

interface Course {
  id: string;
  title: string;
  course_slug: string;
  created_at: string;
  images?: string[];
  grantedAt?: string;
}

interface MyCoursesClientProps {
  email: string;
  courses: Course[];
}

export default function MyCoursesClient({ email, courses }: MyCoursesClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewedStatuses, setViewedStatuses] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // Check viewed status for each course on client side
    const statuses: { [key: string]: boolean } = {};
    courses.forEach(course => {
      const isViewed = localStorage.getItem(`viewed_post_${course.id}`) === 'true';
      statuses[course.id] = isViewed;
    });
    setViewedStatuses(statuses);
  }, [courses]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Filter courses based on search query
  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div style={{ width: '100%' }}>
      {/* Top Header Section */}
      <div className={styles.coursesHeader}>
        <div className={styles.coursesHeaderTitle}>
          <GraduationCap size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className={styles.coursesMainTitle}>Khóa Học Của Tôi</h1>
            <p className={styles.coursesHeaderEmail}>Học viên: <strong>{email}</strong></p>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutButton}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>

      {/* Search Bar */}
      <div className={styles.searchContainer} style={{ marginBottom: '30px' }}>
        <div className={styles.searchInputWrapper}>
          <Search className={styles.searchInputIcon} size={18} />
          <input
            type="text"
            placeholder="Tìm kiếm nhanh khóa học của bạn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Courses Grid */}
      {filteredCourses.length > 0 ? (
        <div className={styles.coursesGrid}>
          {filteredCourses.map(course => {
            const isViewed = viewedStatuses[course.id];
            const grantedDate = course.grantedAt 
              ? new Date(course.grantedAt).toLocaleDateString('vi-VN', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              : 'Đã kích hoạt';

            const courseImage = course.images && course.images.length > 0
              ? course.images[0]
              : null;

            return (
              <div key={course.id} className={styles.courseCard}>
                {/* Course Image */}
                <div className={styles.courseCardImageWrapper}>
                  {courseImage ? (
                    <img src={courseImage} alt={course.title} className={styles.courseCardImage} />
                  ) : (
                    <div className={styles.courseCardPlaceholder}>
                      <BookOpen size={36} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                  )}
                  {/* Status Badge */}
                  <span className={isViewed ? styles.statusBadgeViewed : styles.statusBadgeLearning}>
                    {isViewed ? 'Đã xem' : 'Đang học'}
                  </span>
                </div>

                {/* Card Content */}
                <div className={styles.courseCardContent}>
                  <h3 className={styles.courseCardTitle} title={course.title}>{course.title}</h3>
                  <p className={styles.courseCardDate}>Được duyệt ngày: {grantedDate}</p>
                  
                  <Link href={`/post/${course.id}`} className={styles.courseCardBtn}>
                    Vào học <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyCoursesCard}>
          <p className={styles.emptyCoursesText}>
            {searchQuery 
              ? 'Không tìm thấy khóa học nào phù hợp với tìm kiếm.'
              : 'Tài khoản của bạn chưa có khóa học nào.'}
          </p>
        </div>
      )}
    </div>
  );
}
