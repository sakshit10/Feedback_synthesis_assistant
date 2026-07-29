'use client';

import { useEffect, useState } from 'react';
import type { HistoricalNote } from '@/lib/types';
import { addHistoricalNote, fetchHistoricalNotes } from '@/lib/apiClient';

export function HistoricalNotesPanel() {
  const [notes, setNotes] = useState<HistoricalNote[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { notes } = await fetchHistoricalNotes();
      setNotes(notes);
    } catch {
      // non-fatal, panel just shows empty state
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addHistoricalNote(title.trim(), content.trim());
      setTitle('');
      setContent('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-line bg-white p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h2 className="font-display text-lg text-ink">Historical themes &amp; product notes</h2>
          <p className="mt-1 text-sm text-slate">
            {notes.length === 0
              ? 'Empty — the AI will note that no historical context was available.'
              : `${notes.length} note${notes.length === 1 ? '' : 's'} available for comparison.`}
          </p>
        </div>
        <span className="text-slate">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-sm border border-line bg-paper p-2.5">
              <p className="text-sm font-medium text-ink">{n.title}</p>
              <p className="mt-0.5 text-xs text-slate">{n.content}</p>
            </div>
          ))}

          <div className="border-t border-line pt-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title, e.g. 'Q2 checkout drop-off theme'"
              className="mb-2 w-full rounded-sm border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What was previously known about this theme…"
              rows={2}
              className="mb-2 w-full rounded-sm border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            {error && <p className="mb-2 text-xs text-rust">{error}</p>}
            <button type="button" className="btn-secondary" disabled={saving} onClick={handleAdd}>
              {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
