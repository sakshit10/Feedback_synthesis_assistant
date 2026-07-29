'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadPanel } from '@/components/UploadPanel';
import { HistoricalNotesPanel } from '@/components/HistoricalNotesPanel';
import { ThemeCard } from '@/components/ThemeCard';
import { FeedbackDrawer } from '@/components/FeedbackDrawer';
import { SplitDialog } from '@/components/SplitDialog';
import { MergeBar } from '@/components/MergeBar';
import { fetchThemes, runSynthesis, saveReport } from '@/lib/apiClient';
import type { ThemeWithStats } from '@/lib/types';

type Phase = 'upload' | 'ready_to_synthesize' | 'synthesizing' | 'review' | 'synthesis_failed';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [validRowCount, setValidRowCount] = useState(0);

  const [themes, setThemes] = useState<ThemeWithStats[]>([]);
  const [overview, setOverview] = useState({ total_feedback: 0, themed_feedback: 0, unthemed_feedback: 0 });
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisNotice, setSynthesisNotice] = useState<string | null>(null);

  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [feedbackDrawerThemeId, setFeedbackDrawerThemeId] = useState<string | null>(null);
  const [splitThemeId, setSplitThemeId] = useState<string | null>(null);

  const [savingReport, setSavingReport] = useState(false);
  const [reportSavedId, setReportSavedId] = useState<string | null>(null);

  const loadThemes = useCallback(async () => {
    if (!batchId) return;
    const res = await fetchThemes(batchId);
    setThemes(res.themes);
    setOverview(res.overview);
  }, [batchId]);

  useEffect(() => {
    if (phase === 'review') loadThemes();
  }, [phase, loadThemes]);

  function handleUploaded(newBatchId: string, name: string, rows: number) {
    setBatchId(newBatchId);
    setFilename(name);
    setValidRowCount(rows);
    setPhase('ready_to_synthesize');
    setThemes([]);
    setReportSavedId(null);
  }

  async function handleSynthesize() {
    if (!batchId) return;
    setPhase('synthesizing');
    setSynthesisError(null);
    setSynthesisNotice(null);
    try {
      const res = await runSynthesis(batchId);
      const notices: string[] = [];
      if (res.items_truncated) {
        notices.push(
          `Only the first ${res.items_considered} feedback items were analyzed in this pass (dataset exceeds the single-pass limit).`
        );
      }
      if (res.dropped_citations.length > 0) {
        notices.push(
          `The model referenced ${res.dropped_citations.reduce((s, d) => s + d.bad_ids.length, 0)} feedback ID(s) that didn't exist; those citations were dropped automatically.`
        );
      }
      if (res.uncited_notes) {
        notices.push(`Model note on uncategorized feedback: ${res.uncited_notes}`);
      }
      setSynthesisNotice(notices.join(' '));
      setPhase('review');
    } catch (err) {
      setSynthesisError((err as Error).message);
      setPhase('synthesis_failed');
    }
  }

  function toggleMergeSelect(id: string) {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveReport() {
    if (!batchId) return;
    setSavingReport(true);
    try {
      const res = await saveReport(batchId);
      setReportSavedId(res.report_id);
    } catch (err) {
      setSynthesisError((err as Error).message);
    } finally {
      setSavingReport(false);
    }
  }

  const approvedCount = themes.filter((t) => t.status === 'approved').length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="tag tag-computed mb-2">AI Product Feedback Synthesis Assistant</p>
        <h1 className="font-display text-2xl text-ink">Turn raw feedback into reviewable themes</h1>
        <p className="mt-1 text-sm text-slate">
          The model proposes groupings and problem statements. Every count and chart is computed by
          code from the citations it gives — never invented, never auto-prioritized.
        </p>
      </header>

      <div className="space-y-5">
        <UploadPanel onUploaded={handleUploaded} />
        <HistoricalNotesPanel />

        {phase === 'ready_to_synthesize' && batchId && (
          <div className="rounded border border-line bg-white p-5">
            <p className="text-sm text-ink">
              <span className="ledger-num font-medium">{validRowCount}</span> feedback rows loaded from{' '}
              <span className="font-medium">{filename}</span>.
            </p>
            <button className="btn-primary mt-3" onClick={handleSynthesize}>
              Run AI synthesis
            </button>
          </div>
        )}

        {phase === 'synthesizing' && (
          <div className="rounded border border-line bg-white p-5">
            <p className="text-sm text-ink">Analyzing feedback and proposing themes…</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          </div>
        )}

        {phase === 'synthesis_failed' && (
          <div className="rounded border border-rust/30 bg-rust/5 p-5">
            <p className="text-sm text-rust">Synthesis failed: {synthesisError}</p>
            <button className="btn-secondary mt-3" onClick={handleSynthesize}>
              Retry
            </button>
          </div>
        )}

        {phase === 'review' && (
          <>
            {synthesisNotice && (
              <div className="rounded border border-amber/40 bg-amber/5 p-3 text-xs text-ink">{synthesisNotice}</div>
            )}

            <div className="rounded border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span>
                  Total feedback: <span className="ledger-num font-medium">{overview.total_feedback}</span>
                </span>
                <span>
                  In a theme: <span className="ledger-num font-medium">{overview.themed_feedback}</span>
                </span>
                <span>
                  Unthemed: <span className="ledger-num font-medium">{overview.unthemed_feedback}</span>
                </span>
                <span>
                  Approved themes: <span className="ledger-num font-medium">{approvedCount}</span> / {themes.length}
                </span>
              </div>
            </div>

            {themes.length === 0 && (
              <div className="rounded border border-line bg-white p-8 text-center">
                <p className="text-sm text-slate">No themes were produced from this batch.</p>
              </div>
            )}

            <div className="space-y-4">
              {themes.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  selectedForMerge={mergeSelection.has(t.id)}
                  onToggleMergeSelect={toggleMergeSelect}
                  onChanged={loadThemes}
                  onViewFeedback={setFeedbackDrawerThemeId}
                  onSplit={setSplitThemeId}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-line pt-4">
              <button className="btn-primary" disabled={savingReport} onClick={handleSaveReport}>
                {savingReport ? 'Saving…' : 'Save reviewed synthesis report'}
              </button>
              {reportSavedId && <span className="text-xs text-accent">Saved report {reportSavedId.slice(0, 8)}</span>}
            </div>
          </>
        )}
      </div>

      {mergeSelection.size >= 2 && (
        <MergeBar
          selectedIds={[...mergeSelection]}
          themes={themes}
          onClear={() => setMergeSelection(new Set())}
          onMerged={() => {
            setMergeSelection(new Set());
            loadThemes();
          }}
        />
      )}

      {feedbackDrawerThemeId && (
        <FeedbackDrawer themeId={feedbackDrawerThemeId} onClose={() => setFeedbackDrawerThemeId(null)} />
      )}

      {splitThemeId && (
        <SplitDialog
          themeId={splitThemeId}
          themeTitle={themes.find((t) => t.id === splitThemeId)?.title ?? ''}
          onClose={() => setSplitThemeId(null)}
          onSplit={() => {
            setSplitThemeId(null);
            loadThemes();
          }}
        />
      )}
    </main>
  );
}
