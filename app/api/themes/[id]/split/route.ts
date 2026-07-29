import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { logEvent } from '@/lib/logger';
import type { Theme } from '@/lib/types';

interface SplitGroup {
  title: string;
  problem_statement: string;
  feedback_ids: string[];
}

// Splits the theme identified by [id] into multiple new themes. Every
// feedback_id in every group must have been cited by the original theme —
// this endpoint never invents new citations, it only redistributes existing
// human-verified ones. The original theme is marked 'split' and no longer
// shown as an active theme.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const original = db.prepare('SELECT * FROM themes WHERE id = ?').get(params.id) as
    | Theme
    | undefined;

  if (!original) {
    return NextResponse.json({ error: 'Theme not found.' }, { status: 404 });
  }

  const body = await req.json();
  const groups: SplitGroup[] = Array.isArray(body?.groups) ? body.groups : [];

  if (groups.length < 2) {
    return NextResponse.json({ error: 'Provide at least 2 groups to split into.' }, { status: 400 });
  }

  const originalLinks = (
    db.prepare('SELECT feedback_id FROM theme_feedback WHERE theme_id = ?').all(original.id) as {
      feedback_id: string;
    }[]
  ).map((r) => r.feedback_id);
  const originalSet = new Set(originalLinks);

  for (const g of groups) {
    if (!g.title?.trim() || !g.problem_statement?.trim()) {
      return NextResponse.json(
        { error: 'Each group needs a title and problem_statement.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(g.feedback_ids) || g.feedback_ids.length === 0) {
      return NextResponse.json({ error: 'Each group needs at least one feedback_id.' }, { status: 400 });
    }
    const invalid = g.feedback_ids.filter((fid) => !originalSet.has(fid));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Group "${g.title}" references feedback not cited by the original theme: ${invalid.join(', ')}`,
        },
        { status: 400 }
      );
    }
  }

  const insertTheme = db.prepare(
    `INSERT INTO themes
     (id, batch_id, title, problem_statement, rationale, historical_comparison, pattern_type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed')`
  );
  const insertLink = db.prepare('INSERT OR IGNORE INTO theme_feedback (theme_id, feedback_id) VALUES (?, ?)');
  const markSplit = db.prepare(
    "UPDATE themes SET status = 'split', updated_at = datetime('now') WHERE id = ?"
  );
  const clearOldLinks = db.prepare('DELETE FROM theme_feedback WHERE theme_id = ?');

  const newThemeIds: string[] = [];

  const tx = db.transaction(() => {
    for (const g of groups) {
      const newId = uuid();
      const patternType = g.feedback_ids.length >= 2 ? 'recurring' : 'isolated';
      insertTheme.run(
        newId,
        original.batch_id,
        g.title.trim(),
        g.problem_statement.trim(),
        `Split from theme "${original.title}" by human reviewer.`,
        original.historical_comparison,
        patternType
      );
      for (const fid of g.feedback_ids) insertLink.run(newId, fid);
      newThemeIds.push(newId);
    }
    clearOldLinks.run(original.id);
    markSplit.run(original.id);
  });
  tx();

  logEvent('human', 'split_theme', 'theme', original.id, {
    new_theme_ids: newThemeIds,
    group_count: groups.length,
  });

  return NextResponse.json({ new_theme_ids: newThemeIds });
}
