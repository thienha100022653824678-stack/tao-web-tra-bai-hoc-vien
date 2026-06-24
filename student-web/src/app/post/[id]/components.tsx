'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Copy, Check, Eye } from 'lucide-react';
import styles from './post.module.css';

// 1. Client Component to track views on mount
export function ViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    // Generate UUID fallback
    const generateUUID = () => {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    // Get or create unique session ID in localStorage
    let sessionId = localStorage.getItem('student-session-id');
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem('student-session-id', sessionId);
    }

    // Record view asynchronously in the background
    fetch(`/api/posts/${postId}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => {
        if (!res.ok) console.warn('Failed to record view');
      })
      .catch((err) => console.error('Error in ViewTracker:', err));
  }, [postId]);

  return null;
}

// 2. Client Component for Image Gallery
export function ImageGallery({ images }: { images: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className={styles.mainImageWrapper}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          Không có hình ảnh
        </div>
      </div>
    );
  }

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className={styles.imageSection}>
      <div className={styles.mainImageWrapper}>
        {images.length > 1 && (
          <>
            <button className={`${styles.navButton} ${styles.prevButton}`} onClick={handlePrev} aria-label="Previous image">
              <ChevronLeft size={24} />
            </button>
            <button className={`${styles.navButton} ${styles.nextButton}`} onClick={handleNext} aria-label="Next image">
              <ChevronRight size={24} />
            </button>
          </>
        )}
        
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[activeIndex]}
          alt={`Homework result ${activeIndex + 1}`}
          className={styles.mainImage}
        />
      </div>

      {images.length > 1 && (
        <div className={styles.thumbnailContainer}>
          {images.map((img, idx) => (
            <div
              key={idx}
              className={`${styles.thumbnail} ${idx === activeIndex ? styles.activeThumbnail : ''}`}
              onClick={() => setActiveIndex(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`Thumbnail ${idx + 1}`} className={styles.thumbnailImage} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 3. Helper to render custom formatted recipe text
function RecipeRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className={styles.recipeContent}>
      {lines.map((line, idx) => {
        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={idx}>{line.substring(4)}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={idx}>{line.substring(3)}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={idx}>{line.substring(2)}</h2>;
        }
        
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={idx} className={styles.recipeLi}>{line.substring(2)}</li>;
        }
        
        // Ordered lists
        const match = line.match(/^(\d+)\.\s(.*)/);
        if (match) {
          return (
            <li key={idx} className={styles.recipeOlLi}>
              <span className={styles.olNumber}>{match[1]}.</span> {match[2]}
            </li>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={idx} className={styles.recipeSpacer}></div>;
        }
        
        // Standard paragraphs
        return <p key={idx}>{line}</p>;
      })}
    </div>
  );
}

// 4. Client Component for Recipe actions (Copy to clipboard & rendering)
export function RecipeCardWrapper({ title, recipe }: { title: string; recipe: string }) {
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${recipe}`);
      setCopied(true);
      setShowToast(true);
    } catch (err) {
      console.error('Failed to copy recipe:', err);
    }
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
        setCopied(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <>
      <div className={`${styles.recipeCard} glass`}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Công Thức & Hướng Dẫn</h3>
          <button className={styles.copyButton} onClick={handleCopy}>
            {copied ? <Check size={16} style={{ color: 'var(--accent-success)' }} /> : <Copy size={16} />}
            {copied ? 'Đã sao chép' : 'Sao chép'}
          </button>
        </div>

        <RecipeRenderer content={recipe} />
      </div>

      {showToast && (
        <div className={styles.toast}>
          <Check size={18} />
          <span>Đã sao chép công thức vào bộ nhớ tạm!</span>
        </div>
      )}
    </>
  );
}
