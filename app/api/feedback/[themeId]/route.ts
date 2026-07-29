import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { FeedbackItem } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: { themeId: string } }) {
  const db = getDb();

  const theme = db.prepare('SELECT id, title FROM themes WHERE id = ?').get(params.themeId);
  if (!theme) {
    return NextResponse.json({ error: 'Theme not found.' }, { status: 404 });
  }

  const items = db
    .prepare(
      `SELECT f.* FROM feedback_items f
       JOIN theme_feedback tf ON tf.feedback_id = f.id
       WHERE tf.theme_id = ?
       ORDER BY f.feedback_date ASC`
    )
    .all(params.themeId) as FeedbackItem[];

  return NextResponse.json({ theme, feedback: items });
}
