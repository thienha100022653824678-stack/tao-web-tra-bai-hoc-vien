'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Plus, Search, Copy, Check, Eye, Edit, Trash2, 
  BarChart3, LogOut, GraduationCap, X, Calendar, 
  Laptop, RefreshCw, AlertCircle, FileText, Download, Upload
} from 'lucide-react';
import styles from './page.module.css';

interface Post {
  id: string;
  title: string;
  recipe: string;
  images: string[];
  unique_views: number;
  total_views: number;
  created_at: string;
}

interface ViewLog {
  id: string;
  session_id: string;
  ip_address: string;
  user_agent: string;
  country?: string;
  city?: string;
  viewed_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalUniqueViews, setGlobalUniqueViews] = useState(0);
  
  // Modal State
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [viewLogs, setViewLogs] = useState<ViewLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Toast/Feedback state
  const [toastMessage, setToastMessage] = useState('');
  const [copiedPostId, setCopiedPostId] = useState('');

  // Fetch posts
  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      if (res.ok && data.success) {
        setPosts(data.posts);
        if (data.global_unique_views !== undefined) {
          setGlobalUniqueViews(data.global_unique_views);
        }
      } else {
        showToast('Lỗi khi tải danh sách bài tập');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi đăng xuất');
    }
  };

  // Get student link helper
  const getStudentLink = (postId: string) => {
    let studentAppUrl = process.env.NEXT_PUBLIC_STUDENT_APP_URL || '';
    
    // Sanitize in case the user pasted the entire 'KEY=VALUE' line into Vercel
    if (studentAppUrl.includes('=')) {
      const parts = studentAppUrl.split('=');
      studentAppUrl = parts[parts.length - 1];
    }
    
    if (studentAppUrl) {
      return `${studentAppUrl.trim().replace(/\/$/, '')}/post/${postId}`;
    }
    // Fallback if environment variable not set
    return `/post/${postId} (Cấu hình NEXT_PUBLIC_STUDENT_APP_URL)`;
  };

  const handleCopyLink = async (postId: string) => {
    const link = getStudentLink(postId);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedPostId(postId);
      showToast('Đã sao chép liên kết học viên!');
      setTimeout(() => setCopiedPostId(''), 2000);
    } catch (err) {
      console.error(err);
      showToast('Không thể sao chép liên kết');
    }
  };

  const handleDeletePost = async (postId: string, title: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa bài viết "${title}" không?\nHành động này không thể hoàn tác.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Đã xóa bài viết thành công');
        fetchPosts();
      } else {
        showToast(data.error || 'Lỗi khi xóa bài viết');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ');
    }
  };

  const handleOpenStats = async (post: Post) => {
    setSelectedPost(post);
    setModalOpen(true);
    setLoadingLogs(true);
    setViewLogs([]);

    try {
      const res = await fetch(`/api/posts/${post.id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setViewLogs(data.logs || []);
        // Update current post count if changed
        setSelectedPost({
          ...post,
          unique_views: data.post.unique_views,
          total_views: data.post.total_views
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Không thể tải lịch sử lượt xem');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleExportCSV = () => {
    if (!selectedPost || viewLogs.length === 0) return;

    const headers = ['Thời gian xem', 'Mã phiên (Session ID)', 'Địa chỉ IP', 'Quốc gia', 'Thành phố', 'Thiết bị/Trình duyệt'];
    const rows = viewLogs.map(log => [
      formatDate(log.viewed_at),
      log.session_id,
      log.ip_address,
      log.country || 'Unknown',
      log.city || 'Unknown',
      log.user_agent.replace(/"/g, '""') // Escape quotes
    ]);

    // Use BOM \uFEFF to make sure Excel opens it as UTF-8 (Vietnamese characters supported)
    const csvContent = "\uFEFF" + [
      headers.join(','), 
      ...rows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Sanitize title for filename
    const safeTitle = selectedPost.title
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `thong_ke_luot_xem_${safeTitle}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Đã xuất file CSV thành công!');
  };

  // Helper formatting values
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatUa = (uaString: string) => {
    if (!uaString) return 'Không rõ';
    if (uaString.includes('Windows')) return 'Windows / Web';
    if (uaString.includes('iPhone') || uaString.includes('iPad')) return 'iOS / Mobile';
    if (uaString.includes('Android')) return 'Android / Mobile';
    if (uaString.includes('Macintosh')) return 'macOS / Web';
    if (uaString.includes('Linux')) return 'Linux / Web';
    return uaString.substring(0, 30) + '...';
  };

  // Calculations
  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUniqueViews = posts.reduce((sum, post) => sum + post.unique_views, 0);
  const totalRawViews = posts.reduce((sum, post) => sum + post.total_views, 0);

  return (
    <main className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Hệ thống Quản trị Bài tập</h1>
          <p>Quản lý nội dung bài học, bài tập học viên và thống kê truy cập</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/import" className={`${styles.btn} ${styles.btnSecondary}`}>
            <Upload size={18} /> Import Excel
          </Link>
          <Link href="/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            <Plus size={18} /> Đăng bài mới
          </Link>
          <button onClick={handleLogout} className={`${styles.btn} ${styles.btnSecondary}`}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </header>

      {/* Stats row */}
      <section className={styles.statsRow}>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon}>
            <FileText size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Tổng số bài viết</h3>
            <div className={styles.statValue}>{posts.length}</div>
          </div>
        </div>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon}>
            <BarChart3 size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Tổng lượt xem (Mọi thiết bị)</h3>
            <div className={styles.statValue}>{totalRawViews}</div>
          </div>
        </div>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon}>
            <Eye size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Số người xem duy nhất (theo IP)</h3>
            <div className={styles.statValue}>{globalUniqueViews}</div>
          </div>
        </div>
      </section>

      {/* Content Area */}
      <section className={`${styles.contentArea} glass`}>
        <div className={styles.tableToolbar}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm tiêu đề bài viết..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <button onClick={fetchPosts} className={`${styles.btn} ${styles.btnSecondary}`} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.animateSpin : ''} /> Làm mới
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Đang tải dữ liệu...
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertCircle className={styles.emptyStateIcon} size={48} />
            <h3 className={styles.emptyStateTitle}>Không tìm thấy bài viết nào</h3>
            <p className={styles.emptyStateText}>
              {searchQuery ? 'Không tìm thấy kết quả phù hợp với từ khóa.' : 'Bắt đầu đăng bài viết đầu tiên của bạn ngay.'}
            </p>
            {!searchQuery && (
              <Link href="/new" className={`${styles.btn} ${styles.btnPrimary}`}>
                <Plus size={18} /> Tạo bài tập ngay
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Bài viết</th>
                  <th className={styles.th}>Ngày đăng</th>
                  <th className={styles.th}>Lượt xem</th>
                  <th className={styles.th}>Liên kết học viên</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr key={post.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.titleCell}>
                        {post.images && post.images.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.images[0]} alt="" className={styles.postThumbnail} />
                        ) : (
                          <div className={styles.postThumbnail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>No Img</div>
                        )}
                        <span className={styles.postTitleText}>{post.title}</span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {new Date(post.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.viewsCol}>
                        <div className={styles.viewsDetail}>
                          <span>IP duy nhất: <strong>{post.unique_views}</strong></span>
                          <span>Tổng cộng: {post.total_views}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.linkGroup}>
                        <span className={styles.linkText}>{getStudentLink(post.id)}</span>
                        <button 
                          onClick={() => handleCopyLink(post.id)}
                          className={styles.copyIconBtn}
                          title="Sao chép link trả bài"
                        >
                          {copiedPostId === post.id ? <Check size={14} style={{ color: 'var(--accent-success)' }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className={styles.td} style={{ textAlign: 'right' }}>
                      <div className={styles.actionGroup} style={{ justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleOpenStats(post)}
                          className={`${styles.actionBtn} ${styles.btnStats}`}
                          title="Xem chi tiết lượt xem"
                        >
                          <BarChart3 size={16} />
                        </button>
                        <Link
                          href={`/edit/${post.id}`}
                          className={`${styles.actionBtn} ${styles.btnEdit}`}
                          title="Chỉnh sửa bài viết"
                        >
                          <Edit size={16} />
                        </Link>
                        <button
                          onClick={() => handleDeletePost(post.id, post.title)}
                          className={`${styles.actionBtn} ${styles.btnDelete}`}
                          title="Xóa bài viết"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Analytics Modal */}
      {modalOpen && selectedPost && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={`${styles.modal} glass`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h2>Thống kê chi tiết lượt xem</h2>
                <p>Bài tập: {selectedPost.title}</p>
              </div>
              <button className={styles.btnClose} onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.modalStats}>
                <div className={styles.modalStatItem}>
                  <label>Số người xem duy nhất (theo IP)</label>
                  <p>{selectedPost.unique_views}</p>
                </div>
                <div className={styles.modalStatItem}>
                  <label>Tổng lượt xem ghi nhận</label>
                  <p>{selectedPost.total_views}</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>Lịch sử lượt xem mới nhất</h3>
                {viewLogs.length > 0 && (
                  <button 
                    onClick={handleExportCSV} 
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Download size={12} /> Xuất file CSV
                  </button>
                )}
              </div>
              
              {loadingLogs ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Đang tải lịch sử truy cập...
                </div>
              ) : viewLogs.length === 0 ? (
                <div className={styles.noLogs}>
                  Chưa ghi nhận lượt xem nào cho bài tập này.
                </div>
              ) : (
                <div className={styles.logsTableWrapper}>
                  <table className={styles.table} style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th className={styles.logTh}>Thời gian xem</th>
                        <th className={styles.logTh}>Mã thiết bị (Session)</th>
                        <th className={styles.logTh}>Địa chỉ IP</th>
                        <th className={styles.logTh}>Khu vực (Vị trí)</th>
                        <th className={styles.logTh}>Hệ điều hành / Thiết bị</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                          <td className={styles.logTd}>{formatDate(log.viewed_at)}</td>
                          <td className={`${styles.logTd} ${styles.logSession}`}>
                            {log.session_id.substring(0, 8)}...{log.session_id.substring(log.session_id.length - 4)}
                          </td>
                          <td className={styles.logTd}>{log.ip_address}</td>
                          <td className={styles.logTd}>
                            {log.city && log.city !== 'Unknown' ? `${log.city}, ${log.country}` : log.country || 'Unknown'}
                          </td>
                          <td className={styles.logTd} title={log.user_agent}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Laptop size={12} style={{ color: 'var(--text-muted)' }} />
                              {formatUa(log.user_agent)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={styles.toast}>
          <Check size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
}
