import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { computeThemeStats, computeBatchOverview } from '@/lib/stats';
import { logEvent } from '@/lib/logger';
import type { Theme } from '@/lib/types';

export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batch_id');
  if (!batchId) {
    return NextResponse.json({ error: 'batch_id query param is required.' }, { status: 400 });
  }
  const db = getDb();
  const report = db
    .prepare('SELECT * FROM reports WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(batchId) as { id: string; batch_id: string; snapshot: string; created_at: string } | undefined;

  if (!report) {
    return NextResponse.json({ report: null });
  }
  return NextResponse.json({ report: { ...report, snapshot: JSON.parse(report.snapshot) } });
}

// Saves a point-in-time snapshot of the reviewed synthesis: every theme's
// current state plus its deterministic stats. This is the artifact a PM
// would export and share.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const batchId: string | undefined = body?.batch_id;
  if (!batchId) {
    return NextResponse.json({ error: 'batch_id is required.' }, { status: 400 });
  }

  const db = getDb();
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found.' }, { status: 404 });
  }

  const themes = db
    .prepare("SELECT * FROM themes WHERE batch_id = ? AND status IN ('approved','proposed','rejected') ORDER BY created_at ASC")
    .all(batchId) as Theme[];

  const snapshot = {
    generated_at: new Date().toISOString(),
    batch,
    overview: computeBatchOverview(batchId),
    themes: themes.map((t) => ({
      ...t,
      stats: computeThemeStats(t.id),
    })),
  };

  const id = uuid();
  db.prepare('INSERT INTO reports (id, batch_id, snapshot) VALUES (?, ?, ?)').run(
    id,
    batchId,
    JSON.stringify(snapshot)
  );

  logEvent('human', 'save_report', 'report', id, {
    batch_id: batchId,
    theme_count: themes.length,
    approved_count: themes.filter((t) => t.status === 'approved').length,
  });

  return NextResponse.json({ report_id: id, snapshot });
}
