import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Eye, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ImageGallery, RecipeCardWrapper, ViewTracker } from './components';
import styles from './post.module.css';

interface PostPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PostDetail({ params }: PostPageProps) {
  const { id } = await params;

  // Fetch post data on the server
  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !post) {
    console.error('Error fetching post:', error);
    return (
      <main className={styles.container}>
        <div className={`${styles.errorCard} glass animate-fade-in`}>
          <AlertTriangle className={styles.errorIcon} size={64} />
          <h2 className={styles.errorTitle}>Không Tìm Thấy Bài Viết</h2>
          <p className={styles.errorText}>
            Liên kết này không chính xác hoặc bài viết đã bị gỡ bỏ bởi giảng viên. 
            Vui lòng kiểm tra lại liên kết hoặc liên hệ trực tiếp để được hỗ trợ.
          </p>
          <Link href="/" className={styles.homeButton}>
            <ArrowLeft size={18} /> Quay về Trang chủ
          </Link>
        </div>
      </main>
    );
  }

  // Format date
  const formattedDate = new Date(post.created_at).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className={styles.container}>
      {/* ViewTracker to record view count on mount */}
      <ViewTracker postId={id} />

      <Link href="/" className={styles.backButton}>
        <ArrowLeft size={16} /> Quay lại cổng học viên
      </Link>

      <div className={`${styles.grid} animate-fade-in`}>
        {/* Left Column: Image Gallery */}
        <ImageGallery images={post.images || []} />

        {/* Right Column: Title and Recipe details */}
        <div className={styles.infoSection}>
          <div className={styles.header}>
            <div className={styles.meta}>
              <div className={styles.metaItem}>
                <Calendar size={16} style={{ color: 'var(--accent)' }} />
                <span>{formattedDate}</span>
              </div>
              <div className={`${styles.metaItem} ${styles.viewsBadge}`}>
                <Eye size={16} />
                <span>{post.views} lượt xem</span>
              </div>
            </div>
            <h1 className={styles.title}>{post.title}</h1>
          </div>

          {/* Recipe Card */}
          <RecipeCardWrapper title={post.title} recipe={post.recipe} />
        </div>
      </div>
    </main>
  );
}
