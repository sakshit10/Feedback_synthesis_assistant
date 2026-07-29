'use client';

import { useState } from 'react';
import type { ThemeWithStats } from '@/lib/types';
import { mergeThemes } from '@/lib/apiClient';

interface Props {
  selectedIds: string[];
  themes: ThemeWithStats[];
  onClear: () => void;
  onMerged: () => void;
}

export function MergeBar({ selectedIds, themes, onClear, onMerged }: Props) {
  const [targetId, setTargetId] = useState<string>(selectedIds[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedThemes = themes.filter((t) => selectedIds.includes(t.id));

  async function handleMerge() {
    const sources = selectedIds.filter((id) => id !== targetId);
    setBusy(true);
    setError(null);
    try {
      await mergeThemes(targetId, sources);
      onMerged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(640px,92vw)] -translate-x-1/2 rounded border border-line bg-white p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink">
          Merge {selectedIds.length} themes into:
        </span>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="rounded-sm border border-line px-2 py-1 text-sm outline-none focus:border-accent"
        >
          {selectedThemes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button className="btn-accent" disabled={busy} onClick={handleMerge}>
          {busy ? 'Merging…' : 'Merge'}
        </button>
        <button className="btn-secondary" onClick={onClear}>
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
    </div>
  );
}
