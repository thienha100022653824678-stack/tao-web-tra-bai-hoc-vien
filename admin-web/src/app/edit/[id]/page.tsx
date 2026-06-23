'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Loader2, Info, Trash2, Check, Eye } from 'lucide-react';
import styles from '../../new/new.module.css'; // Share form styling to avoid code duplication

interface PostData {
  id: string;
  title: string;
  recipe: string;
  images: string[];
  views: number;
}

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [title, setTitle] = useState('');
  const [recipe, setRecipe] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [views, setViews] = useState<number>(0);
  
  // Progress states
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch post details on load
  useEffect(() => {
    const fetchPostDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/posts/${id}`);
        const data = await res.json();
        
        if (res.ok && data.success) {
          setTitle(data.post.title);
          setRecipe(data.post.recipe);
          setImages(data.post.images || []);
          setViews(data.post.unique_views); // Unique views override
        } else {
          setError(data.error || 'Không thể tải chi tiết bài viết');
        }
      } catch (err) {
        console.error(err);
        setError('Lỗi kết nối máy chủ');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchPostDetails();
    }
  }, [id]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setError('');
    setUploading(true);

    const formData = new FormData();
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('files', selectedFiles[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setImages((prev) => [...prev, ...data.urls]);
        setToastMessage('Tải ảnh lên thành công!');
        setTimeout(() => setToastMessage(''), 2000);
      } else {
        setError(data.error || 'Có lỗi xảy ra khi tải ảnh lên');
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ khi tải ảnh');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề bài viết');
      return;
    }

    if (!recipe.trim()) {
      setError('Vui lòng nhập công thức chi tiết');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          recipe: recipe.trim(),
          images,
          views: Number(views), // Support view count override
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setToastMessage('Đã cập nhật bài tập thành công!');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1000);
      } else {
        setError(data.error || 'Lỗi khi cập nhật bài viết');
        setSaving(false);
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ khi cập nhật dữ liệu');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-secondary)' }}>
          <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--accent)' }} />
          Đang tải dữ liệu bài viết...
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backHeader}>
        <ArrowLeft size={16} /> Quay lại danh sách quản trị
      </Link>

      <div className={`${styles.card} glass animate-fade-in`}>
        <h1 className={styles.title}>Chỉnh Sửa Bài Tập</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Tiêu đề bài viết</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              className={styles.input}
              disabled={saving}
            />
          </div>

          {/* Views Override */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Chỉnh sửa số lượt xem (Duy nhất)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min="0"
                value={views}
                onChange={(e) => {
                  setViews(Math.max(0, parseInt(e.target.value) || 0));
                  setError('');
                }}
                className={styles.input}
                style={{ maxWidth: '180px' }}
                disabled={saving}
              />
              <span className={styles.helperText} style={{ margin: 0 }}>
                Nhập số lượt xem mới để ghi đè công khai trên trang web học viên.
              </span>
            </div>
          </div>

          {/* Images Upload */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Hình ảnh thành phẩm</label>
            <div onClick={triggerFileSelect} className={styles.uploadZone}>
              <Upload className={styles.uploadZoneIcon} size={28} />
              <div className={styles.uploadZoneTitle}>Nhấp để tải ảnh lên thêm</div>
              <div className={styles.uploadZoneSub}>Hỗ trợ PNG, JPG, JPEG</div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                ref={fileInputRef}
                className={styles.hiddenInput}
                disabled={uploading || saving}
              />
            </div>

            {uploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <Loader2 size={16} className="animate-spin" /> Đang tải ảnh...
              </div>
            )}

            {images.length > 0 && (
              <div className={styles.imageGrid}>
                {images.map((imgUrl, idx) => (
                  <div key={idx} className={styles.previewWrapper}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt={`Uploaded preview ${idx + 1}`} className={styles.previewImage} />
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(idx)}
                      className={styles.btnDeleteImage}
                      title="Xóa hình ảnh này"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recipe Content */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Công thức & Hướng dẫn</label>
            <textarea
              value={recipe}
              onChange={(e) => {
                setRecipe(e.target.value);
                setError('');
              }}
              className={styles.textarea}
              disabled={saving}
            />
            
            {/* Formatting Cheat Sheet */}
            <div className={styles.cheatSheet}>
              <div className={styles.cheatSheetTitle}>
                <Info size={14} /> Hướng dẫn định dạng:
              </div>
              <div className={styles.cheatSheetGrid}>
                <div className={styles.cheatItem}>
                  <code># Tiêu đề lớn</code>
                </div>
                <div className={styles.cheatItem}>
                  <code>- Gạch đầu dòng</code>
                </div>
                <div className={styles.cheatItem}>
                  <code>## Tiêu đề phụ</code>
                </div>
                <div className={styles.cheatItem}>
                  <code>1. Danh sách số</code>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <Link href="/" className={`${styles.btn} ${styles.btnSecondary}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Hủy bỏ
            </Link>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || uploading}>
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Đang cập nhật...
                </>
              ) : (
                'Cập nhật bài tập'
              )}
            </button>
          </div>
        </form>
      </div>

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
