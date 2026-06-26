'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
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

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.webm') ||
    lowerUrl.endsWith('.ogg') ||
    lowerUrl.includes('drive.google.com') ||
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be')
  );
}

function renderMediaElement(url: string) {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('drive.google.com')) {
    let fileId = '';
    let match = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
    if (match) fileId = match[1];
    else {
      match = url.match(/[?&]id=([^&#]+)/);
      if (match) fileId = match[1];
    }
    
    if (fileId) {
      return (
        <iframe
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          className={styles.mainImage}
          style={{ border: 'none', width: '100%', height: '100%', background: '#000' }}
          allow="autoplay; encrypted-media"
          allowFullScreen
        ></iframe>
      );
    }
  }
  
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    let videoId = '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      videoId = match[2];
    }
    
    if (videoId) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className={styles.mainImage}
          style={{ border: 'none', width: '100%', height: '100%', background: '#000' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      );
    }
  }
  
  if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.endsWith('.ogg') || lowerUrl.includes('/video/')) {
    return (
      <video
        src={url}
        controls
        className={styles.mainImage}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Media content"
      className={styles.mainImage}
    />
  );
}

// 2. Client Component for Image/Video Gallery
export function ImageGallery({ images }: { images: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className={styles.mainImageWrapper}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
          Video/Hình ảnh sẽ được Update trong thời gian tới
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
        
        {renderMediaElement(images[activeIndex])}
      </div>

      {images.length > 1 && (
        <div className={styles.thumbnailContainer}>
          {images.map((img, idx) => {
            const isVid = isVideoUrl(img);
            return (
              <div
                key={idx}
                className={`${styles.thumbnail} ${idx === activeIndex ? styles.activeThumbnail : ''}`}
                onClick={() => setActiveIndex(idx)}
                style={{ position: 'relative' }}
              >
                {isVid ? (
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    background: '#1f2937', 
                    color: 'var(--accent)',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    PLAY VIDEO
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className={styles.thumbnailImage} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// 3. Helpers to parse links and render custom formatted recipe text
function parseTextWithLinks(text: string) {
  // Regex to match Markdown links: [Link Text](https://link.url)
  const markdownRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = markdownRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    
    if (matchIndex > lastIndex) {
      parts.push(...parsePlainUrls(text.substring(lastIndex, matchIndex)));
    }

    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a 
        key={`md-link-${matchIndex}`} 
        href={linkUrl} 
        target="_blank" 
        rel="noopener noreferrer"
      >
        {linkText}
      </a>
    );

    lastIndex = markdownRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...parsePlainUrls(text.substring(lastIndex)));
  }

  return parts;
}

function parsePlainUrls(text: string): React.ReactNode[] {
  // Regex to match plain HTTP/HTTPS URLs, avoiding brackets and parentheses
  const urlRegex = /(https?:\/\/[^\s\[\]()]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    const url = match[1];
    // Clean trailing punctuation
    let cleanedUrl = url;
    let trailingText = '';
    const trailingMatch = url.match(/[.,;:?!\])]+$/);
    if (trailingMatch) {
      cleanedUrl = url.substring(0, url.length - trailingMatch[0].length);
      trailingText = trailingMatch[0];
    }

    parts.push(
      <a 
        key={`url-${matchIndex}`} 
        href={cleanedUrl} 
        target="_blank" 
        rel="noopener noreferrer"
      >
        {cleanedUrl}
      </a>
    );
    if (trailingText) {
      parts.push(trailingText);
    }

    lastIndex = urlRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

function RecipeRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className={styles.recipeContent}>
      {lines.map((line, idx) => {
        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={idx}>{parseTextWithLinks(line.substring(4))}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={idx}>{parseTextWithLinks(line.substring(3))}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={idx}>{parseTextWithLinks(line.substring(2))}</h2>;
        }
        
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={idx} className={styles.recipeLi}>{parseTextWithLinks(line.substring(2))}</li>;
        }
        
        // Ordered lists
        const match = line.match(/^(\d+)\.\s(.*)/);
        if (match) {
          return (
            <li key={idx} className={styles.recipeOlLi}>
              <span className={styles.olNumber}>{match[1]}.</span> {parseTextWithLinks(match[2])}
            </li>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={idx} className={styles.recipeSpacer}></div>;
        }
        
        // Standard paragraphs
        return <p key={idx}>{parseTextWithLinks(line)}</p>;
      })}
    </div>
  );
}

// 4. Client Component for Recipe actions (Copy protection & rendering)
export function RecipeCardWrapper({ title, recipe }: { title: string; recipe: string }) {
  const preventCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  return (
    <div 
      className={`${styles.recipeCard} glass`}
      onCopy={preventCopy}
    >
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Công Thức & Hướng Dẫn</h3>
      </div>

      <RecipeRenderer content={recipe} />
    </div>
  );
}
