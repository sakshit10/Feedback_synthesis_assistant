import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logEvent } from '@/lib/logger';
import type { Theme } from '@/lib/types';

// Merges one or more source themes INTO the target theme identified by [id].
// All feedback citations from the sources move to the target (deduplicated);
// the source themes are marked 'merged' and excluded from the active list.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const target = db.prepare('SELECT * FROM themes WHERE id = ?').get(params.id) as
    | Theme
    | undefined;

  if (!target) {
    return NextResponse.json({ error: 'Target theme not found.' }, { status: 404 });
  }

  const body = await req.json();
  const sourceIds: string[] = Array.isArray(body?.source_theme_ids) ? body.source_theme_ids : [];

  if (sourceIds.length === 0) {
    return NextResponse.json({ error: 'source_theme_ids must be a non-empty array.' }, { status: 400 });
  }
  if (sourceIds.includes(target.id)) {
    return NextResponse.json({ error: 'A theme cannot be merged into itself.' }, { status: 400 });
  }

  const sources = sourceIds.map((sid) => {
    const t = db.prepare('SELECT * FROM themes WHERE id = ? AND batch_id = ?').get(sid, target.batch_id) as
      | Theme
      | undefined;
    return t;
  });

  const missing = sourceIds.filter((_, i) => !sources[i]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Source theme(s) not found in this batch: ${missing.join(', ')}` },
      { status: 404 }
    );
  }

  const moveLinks = db.prepare(
    `INSERT OR IGNORE INTO theme_feedback (theme_id, feedback_id)
     SELECT ?, feedback_id FROM theme_feedback WHERE theme_id = ?`
  );
  const markMerged = db.prepare(
    "UPDATE themes SET status = 'merged', merged_into = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const clearOldLinks = db.prepare('DELETE FROM theme_feedback WHERE theme_id = ?');

  const tx = db.transaction(() => {
    for (const sid of sourceIds) {
      moveLinks.run(target.id, sid);
      clearOldLinks.run(sid);
      markMerged.run(target.id, sid);
    }
  });
  tx();

  logEvent('human', 'merge_themes', 'theme', target.id, { source_theme_ids: sourceIds });

  const updatedTarget = db.prepare('SELECT * FROM themes WHERE id = ?').get(target.id);
  return NextResponse.json({ theme: updatedTarget });
}
