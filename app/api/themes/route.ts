import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { computeThemeStats, computeBatchOverview } from '@/lib/stats';
import type { Theme, ThemeWithStats } from '@/lib/types';

export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batch_id');
  if (!batchId) {
    return NextResponse.json({ error: 'batch_id query param is required.' }, { status: 400 });
  }

  const db = getDb();
  const themes = db
    .prepare("SELECT * FROM themes WHERE batch_id = ? AND status != 'merged' ORDER BY created_at ASC")
    .all(batchId) as Theme[];

  const themesWithStats: ThemeWithStats[] = themes.map((t) => {
    const cited = (
      db.prepare('SELECT feedback_id FROM theme_feedback WHERE theme_id = ?').all(t.id) as {
        feedback_id: string;
      }[]
    ).map((r) => r.feedback_id);

    return {
      ...t,
      stats: computeThemeStats(t.id),
      cited_feedback_ids: cited,
      dropped_citation_count: 0,
    };
  });

  return NextResponse.json({
    themes: themesWithStats,
    overview: computeBatchOverview(batchId),
  });
}
