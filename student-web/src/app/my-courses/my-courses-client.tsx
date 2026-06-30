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
  status: 'pending_order' | 'approved_waiting_content' | 'approved_ready';
  grantedAt?: string;
  images?: string[];
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
      if (course.status === 'approved_ready') {
        const isViewed = localStorage.getItem(`viewed_post_${course.id}`) === 'true';
        statuses[course.id] = isViewed;
      }
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
            
            const dateLabel = course.status === 'pending_order' ? 'Ngày đăng ký' : 'Ngày duyệt';
            const formattedDate = course.grantedAt 
              ? new Date(course.grantedAt).toLocaleDateString('vi-VN', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              : 'Đang xử lý';

            const courseImage = course.images && course.images.length > 0
              ? course.images[0]
              : null;

            return (
              <div key={course.id} className={styles.courseCard} style={{ display: 'flex', flexDirection: 'column', background: '#0e1217', borderColor: '#1f2937', borderRadius: '16px', overflow: 'hidden' }}>
                {/* Course Image */}
                <div className={styles.courseCardImageWrapper} style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                  {courseImage ? (
                    <img src={courseImage} alt={course.title} className={styles.courseCardImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className={styles.courseCardPlaceholder} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#181e24' }}>
                      <BookOpen size={48} style={{ color: '#4b5563' }} />
                    </div>
                  )}
                  
                  {/* Status Badge overlay */}
                  {course.status === 'pending_order' && (
                    <span style={{ position: 'absolute', top: '12px', left: '12px', background: '#fbbf24', color: '#000', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', zIndex: 10 }}>
                      🟡 Chờ duyệt
                    </span>
                  )}
                  {course.status === 'approved_waiting_content' && (
                    <span style={{ position: 'absolute', top: '12px', left: '12px', background: '#f97316', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', zIndex: 10 }}>
                      🟠 Chờ lên bài
                    </span>
                  )}
                  {course.status === 'approved_ready' && (
                    <span style={{ position: 'absolute', top: '12px', left: '12px', background: '#22c55e', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', zIndex: 10 }}>
                      🟢 Sẵn sàng
                    </span>
                  )}
                </div>

                {/* Card Content */}
                <div className={styles.courseCardContent} style={{ padding: '1.25rem', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#0e1217' }}>
                  <div style={{ width: '100%' }}>
                    <h3 className={styles.courseCardTitle} style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px', color: '#fff', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {course.title}
                    </h3>
                    
                    {/* Student Email */}
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '6px' }}>
                      Gmail học viên: <strong style={{ color: '#fff', wordBreak: 'break-all' }}>{email}</strong>
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '12px' }}>
                      {dateLabel}: <strong style={{ color: '#fff' }}>{formattedDate}</strong>
                    </div>

                    {/* Status descriptions */}
                    {course.status === 'pending_order' && (
                      <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', padding: '10px 12px', borderRadius: '10px', marginBottom: '16px' }}>
                        <div style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '2px' }}>
                          🟡 Đã đăng ký thành công
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#d1d5db', margin: 0, lineHeight: '1.4' }}>
                          Đơn đăng ký của bạn đã được ghi nhận. Admin sẽ xét duyệt trong vòng 24 giờ.
                        </p>
                      </div>
                    )}

                    {course.status === 'approved_waiting_content' && (
                      <div style={{ background: 'rgba(234, 88, 12, 0.05)', border: '1px solid rgba(234, 88, 12, 0.1)', padding: '10px 12px', borderRadius: '10px', marginBottom: '16px' }}>
                        <div style={{ color: '#f97316', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '2px' }}>
                          🟠 Lớp đang chờ lên bài
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#d1d5db', margin: 0, lineHeight: '1.4' }}>
                          Khóa học của bạn đã được xét duyệt. Hệ thống sẽ gửi Gmail khi lớp học hoàn tất.
                        </p>
                      </div>
                    )}

                    {course.status === 'approved_ready' && (
                      <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.1)', padding: '10px 12px', borderRadius: '10px', marginBottom: '16px' }}>
                        <div style={{ color: '#4ade80', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '2px' }}>
                          🟢 Đã có nội dung
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#d1d5db', margin: 0, lineHeight: '1.4' }}>
                          Khóa học của bạn đã hoàn tất nội dung. Bạn có thể vào học ngay bây giờ.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div style={{ width: '100%', marginTop: 'auto' }}>
                    {course.status === 'pending_order' && (
                      <button disabled style={{ width: '100%', padding: '12px', background: '#1f2937', color: '#9ca3af', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'not-allowed' }}>
                        Chờ xét duyệt
                      </button>
                    )}
                    {course.status === 'approved_waiting_content' && (
                      <button disabled style={{ width: '100%', padding: '12px', background: '#1f2937', color: '#9ca3af', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'not-allowed' }}>
                        Chưa có bài học
                      </button>
                    )}
                    {course.status === 'approved_ready' && (
                      <Link href={`/post/${course.id}`} className={styles.courseCardBtn} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#fff', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none' }}>
                        Vào học ngay <ArrowRight size={16} />
                      </Link>
                    )}
                  </div>
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
