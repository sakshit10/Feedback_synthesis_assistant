'use client';

import { useState } from 'react';
import type { ThemeWithStats } from '@/lib/types';
import { StatsLedger } from './StatsLedger';
import { patchTheme } from '@/lib/apiClient';

interface Props {
  theme: ThemeWithStats;
  selectedForMerge: boolean;
  onToggleMergeSelect: (id: string) => void;
  onChanged: () => void;
  onViewFeedback: (id: string) => void;
  onSplit: (id: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  proposed: 'bg-amber/10 text-amber',
  approved: 'bg-accentSoft text-accent',
  rejected: 'bg-rust/10 text-rust',
};

export function ThemeCard({
  theme,
  selectedForMerge,
  onToggleMergeSelect,
  onChanged,
  onViewFeedback,
  onSplit,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(theme.title);
  const [editingStatement, setEditingStatement] = useState(false);
  const [statement, setStatement] = useState(theme.problem_statement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      await patchTheme(theme.id, { action, ...extra });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selectedForMerge}
            onChange={() => onToggleMergeSelect(theme.id)}
            className="mt-1.5"
            aria-label="Select for merge"
          />
          <div>
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                  autoFocus
                />
                <button
                  className="btn-secondary py-1"
                  onClick={async () => {
                    await run('rename', { title });
                    setRenaming(false);
                  }}
                >
                  Save
                </button>
                <button className="text-xs text-slate" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base text-ink">{theme.title}</h3>
                <button className="text-xs text-slate underline hover:text-ink" onClick={() => setRenaming(true)}>
                  rename
                </button>
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="tag tag-ai">AI-proposed</span>
              <span className={`tag ${STATUS_STYLE[theme.status] ?? 'bg-ink/5 text-slate'}`}>{theme.status}</span>
              <span className="tag tag-computed">{theme.pattern_type} (by count)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {editingStatement ? (
          <div>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <div className="mt-1.5 flex gap-2">
              <button
                className="btn-secondary py-1"
                onClick={async () => {
                  await run('edit_problem_statement', { problem_statement: statement });
                  setEditingStatement(false);
                }}
              >
                Save
              </button>
              <button className="text-xs text-slate" onClick={() => setEditingStatement(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm leading-relaxed text-ink">{theme.problem_statement}</p>
            <button
              className="mt-1 text-xs text-slate underline hover:text-ink"
              onClick={() => setEditingStatement(true)}
            >
              edit problem statement
            </button>
          </div>
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate">
          Rationale &amp; historical comparison
        </summary>
        <div className="mt-2 space-y-2 rounded-sm bg-accentSoft/40 p-2.5">
          <p className="text-xs text-ink">
            <span className="font-medium">Why grouped: </span>
            {theme.rationale || '—'}
          </p>
          <p className="text-xs text-ink">
            <span className="font-medium">Vs. historical notes: </span>
            {theme.historical_comparison || '—'}
          </p>
        </div>
      </details>

      <div className="mt-3">
        <StatsLedger stats={theme.stats} />
      </div>

      {error && <p className="mt-2 text-xs text-rust">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => onViewFeedback(theme.id)}>
          View source feedback ({theme.cited_feedback_ids.length})
        </button>
        <button className="btn-secondary" disabled={theme.cited_feedback_ids.length < 2} onClick={() => onSplit(theme.id)}>
          Split
        </button>
        <button className="btn-accent" disabled={busy || theme.status === 'approved'} onClick={() => run('approve')}>
          Approve
        </button>
        <button className="btn-danger" disabled={busy || theme.status === 'rejected'} onClick={() => run('reject')}>
          Reject
        </button>
      </div>
    </div>
  );
}
