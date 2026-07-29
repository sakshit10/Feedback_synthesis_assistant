'use client';

import { useEffect, useState } from 'react';
import { fetchThemeFeedback } from '@/lib/apiClient';
import type { FeedbackItem } from '@/lib/types';

export function FeedbackDrawer({ themeId, onClose }: { themeId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchThemeFeedback(themeId)
      .then((res) => {
        if (cancelled) return;
        setTitle(res.theme.title);
        setItems(res.feedback);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">Source feedback</h3>
          <button type="button" onClick={onClose} className="text-slate hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate">Theme: {title}</p>

        {loading && <p className="text-sm text-slate">Loading…</p>}
        {error && <p className="text-sm text-rust">{error}</p>}

        <div className="space-y-3">
          {items.map((f) => (
            <div key={f.id} className="rounded-sm border border-line p-3">
              <p className="text-sm text-ink">{f.feedback_text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="tag tag-computed">{f.source}</span>
                <span className="tag tag-computed">{f.user_type}</span>
                <span className="tag tag-computed">{f.product_area}</span>
                <span className="tag tag-computed">{f.feedback_date}</span>
                {f.rating != null && <span className="tag tag-computed">rating {f.rating}</span>}
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && !error && (
            <p className="text-sm text-slate">No feedback linked to this theme.</p>
          )}
        </div>
      </div>
    </div>
  );
}
