'use client';

import { useEffect, useState } from 'react';
import { fetchThemeFeedback, splitTheme } from '@/lib/apiClient';
import type { FeedbackItem } from '@/lib/types';

interface Props {
  themeId: string;
  themeTitle: string;
  onClose: () => void;
  onSplit: () => void;
}

export function SplitDialog({ themeId, themeTitle, onClose, onSplit }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [assignment, setAssignment] = useState<Record<string, 'A' | 'B'>>({});
  const [groupA, setGroupA] = useState({ title: '', problem_statement: '' });
  const [groupB, setGroupB] = useState({ title: '', problem_statement: '' });

  useEffect(() => {
    fetchThemeFeedback(themeId)
      .then((res) => {
        setItems(res.feedback);
        const initial: Record<string, 'A' | 'B'> = {};
        res.feedback.forEach((f: FeedbackItem, i: number) => {
          initial[f.id] = i % 2 === 0 ? 'A' : 'B';
        });
        setAssignment(initial);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [themeId]);

  async function handleSubmit() {
    const aIds = Object.entries(assignment).filter(([, g]) => g === 'A').map(([id]) => id);
    const bIds = Object.entries(assignment).filter(([, g]) => g === 'B').map(([id]) => id);

    if (!groupA.title.trim() || !groupB.title.trim()) {
      setError('Give both groups a title.');
      return;
    }
    if (aIds.length === 0 || bIds.length === 0) {
      setError('Each group needs at least one feedback item.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await splitTheme(themeId, [
        { title: groupA.title, problem_statement: groupA.problem_statement || groupA.title, feedback_ids: aIds },
        { title: groupB.title, problem_statement: groupB.problem_statement || groupB.title, feedback_ids: bIds },
      ]);
      onSplit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">Split theme</h3>
          <button type="button" onClick={onClose} className="text-slate hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate">Dividing: {themeTitle}</p>

        {loading && <p className="text-sm text-slate">Loading feedback…</p>}

        {!loading && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-sm border border-line p-2.5">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">Group A</p>
                <input
                  value={groupA.title}
                  onChange={(e) => setGroupA((s) => ({ ...s, title: e.target.value }))}
                  placeholder="Title"
                  className="mb-1.5 w-full rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                />
                <textarea
                  value={groupA.problem_statement}
                  onChange={(e) => setGroupA((s) => ({ ...s, problem_statement: e.target.value }))}
                  placeholder="Problem statement"
                  rows={2}
                  className="w-full rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="rounded-sm border border-line p-2.5">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">Group B</p>
                <input
                  value={groupB.title}
                  onChange={(e) => setGroupB((s) => ({ ...s, title: e.target.value }))}
                  placeholder="Title"
                  className="mb-1.5 w-full rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                />
                <textarea
                  value={groupB.problem_statement}
                  onChange={(e) => setGroupB((s) => ({ ...s, problem_statement: e.target.value }))}
                  placeholder="Problem statement"
                  rows={2}
                  className="w-full rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate">
              Assign each feedback item
            </p>
            <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
              {items.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-sm border border-line p-2">
                  <p className="text-sm text-ink">{f.feedback_text}</p>
                  <div className="flex shrink-0 gap-1">
                    {(['A', 'B'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setAssignment((a) => ({ ...a, [f.id]: g }))}
                        className={`h-7 w-7 rounded-sm border text-xs font-medium ${
                          assignment[f.id] === g
                            ? 'border-accent bg-accentSoft text-accent'
                            : 'border-line text-slate hover:border-ink'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="mb-3 text-sm text-rust">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn-accent" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Splitting…' : 'Confirm split'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
