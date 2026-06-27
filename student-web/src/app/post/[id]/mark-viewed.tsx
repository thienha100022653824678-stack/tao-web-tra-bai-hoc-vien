'use client';

import { useEffect } from 'react';

interface MarkAsViewedProps {
  postId: string;
}

export default function MarkAsViewed({ postId }: MarkAsViewedProps) {
  useEffect(() => {
    if (typeof window !== 'undefined' && postId) {
      localStorage.setItem(`viewed_post_${postId}`, 'true');
    }
  }, [postId]);

  return null;
}
