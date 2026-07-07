'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Loader2, Info, Image as ImageIcon, Trash2, Check } from 'lucide-react';
import styles from './new.module.css';

export default function NewPostPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [recipe, setRecipe] = useState('');
  const [images, setImages] = useState<string[]>([]);
  
  // Progress states
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

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
      // Reset file input value to allow uploading the same file again
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
      const isShopAdmin = typeof window !== 'undefined' && window.location.hostname.includes('shop');
      const source = isShopAdmin ? 'shop_admin' : 'main_admin';

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          recipe: recipe.trim(),
          images,
          source,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setToastMessage('Đã đăng bài tập thành công!');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1000);
      } else {
        setError(data.error || 'Lỗi khi lưu bài viết');
        setSaving(false);
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ khi lưu dữ liệu');
      setSaving(false);
    }
  };

  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backHeader}>
        <ArrowLeft size={16} /> Quay lại danh sách quản trị
      </Link>

      <div className={`${styles.card} glass animate-fade-in`}>
        <h1 className={styles.title}>Đăng Bài Tập Mới</h1>

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
              placeholder="Ví dụ: Bánh Mì Hoa Cúc Pháp - Học viên Nguyễn Văn A"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              className={styles.input}
              disabled={saving}
            />
            <span className={styles.helperText}>Tiêu đề nên bao gồm tên món ăn và tên học viên trả bài để dễ quản lý.</span>
          </div>

          {/* Images Upload */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Hình ảnh thành phẩm</label>
            <div onClick={triggerFileSelect} className={styles.uploadZone}>
              <Upload className={styles.uploadZoneIcon} size={28} />
              <div className={styles.uploadZoneTitle}>Nhấp để tải ảnh lên (Hỗ trợ chọn nhiều tệp)</div>
              <div className={styles.uploadZoneSub}>Hỗ trợ định dạng PNG, JPG, JPEG</div>
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
                <Loader2 size={16} className="animate-spin" /> Đang tải ảnh lên... Vui lòng đợi
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
              placeholder="Nhập chi tiết công thức làm bánh, hướng dẫn thực hiện..."
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
                <Info size={14} /> Hướng dẫn định dạng bài viết:
              </div>
              <div className={styles.cheatSheetGrid}>
                <div className={styles.cheatItem}>
                  <code># Tiêu đề lớn</code> để tạo đề mục lớn
                </div>
                <div className={styles.cheatItem}>
                  <code>- Nguyên liệu</code> để tạo danh sách gạch đầu dòng
                </div>
                <div className={styles.cheatItem}>
                  <code>## Tiêu đề phụ</code> để tạo đề mục phụ
                </div>
                <div className={styles.cheatItem}>
                  <code>1. Hướng dẫn</code> để tạo danh sách đánh số
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
                  <Loader2 size={16} className="animate-spin" /> Đang lưu bài viết...
                </>
              ) : (
                'Đăng bài tập'
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
