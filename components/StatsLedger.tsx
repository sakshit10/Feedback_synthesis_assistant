'use client';

import type { ThemeStats } from '@/lib/types';

function DistributionRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-slate">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-ink/5">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="ledger-num w-10 shrink-0 text-right text-ink">{count}</span>
    </div>
  );
}

export function StatsLedger({ stats }: { stats: ThemeStats }) {
  const sourceEntries = Object.entries(stats.source_distribution).sort((a, b) => b[1] - a[1]);
  const userTypeEntries = Object.entries(stats.user_type_distribution).sort((a, b) => b[1] - a[1]);
  const monthEntries = Object.entries(stats.frequency_by_month).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="rounded border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="tag tag-computed">computed, not AI-generated</span>
        <span className="ledger-num text-sm font-semibold text-ink">
          {stats.feedback_count} item{stats.feedback_count === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate">By source</p>
          <div className="space-y-1">
            {sourceEntries.length === 0 && <p className="text-xs text-slate">—</p>}
            {sourceEntries.map(([k, v]) => (
              <DistributionRow key={k} label={k} count={v} total={stats.feedback_count} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate">By user type</p>
          <div className="space-y-1">
            {userTypeEntries.length === 0 && <p className="text-xs text-slate">—</p>}
            {userTypeEntries.map(([k, v]) => (
              <DistributionRow key={k} label={k} count={v} total={stats.feedback_count} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate">Over time</p>
        <div className="flex items-end gap-1">
          {monthEntries.length === 0 && <p className="text-xs text-slate">—</p>}
          {monthEntries.map(([month, count]) => {
            const max = Math.max(...monthEntries.map(([, c]) => c), 1);
            const heightPct = Math.max((count / max) * 100, 8);
            return (
              <div key={month} className="flex flex-col items-center gap-1" title={`${month}: ${count}`}>
                <div className="flex h-10 w-4 items-end">
                  <div className="w-full rounded-t bg-amber" style={{ height: `${heightPct}%` }} />
                </div>
                <span className="ledger-num text-[9px] text-slate">{month.slice(2)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {stats.average_rating !== null && (
        <p className="mt-3 text-xs text-slate">
          Average rating: <span className="ledger-num text-ink">{stats.average_rating}</span>
        </p>
      )}
    </div>
  );
}
