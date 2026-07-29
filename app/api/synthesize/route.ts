import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { runSynthesis } from '@/lib/claude';
import { logEvent } from '@/lib/logger';
import type { FeedbackItem, HistoricalNote } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
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

    const items = db
      .prepare('SELECT * FROM feedback_items WHERE batch_id = ?')
      .all(batchId) as FeedbackItem[];

    if (items.length === 0) {
      return NextResponse.json({ error: 'Batch has no feedback items.' }, { status: 422 });
    }

    const notes = db.prepare('SELECT * FROM historical_notes').all() as HistoricalNote[];

    logEvent('system', 'synthesis_started', 'batch', batchId, { item_count: items.length });

    let result;
    try {
      result = await runSynthesis(items, notes);
    } catch (err) {
      logEvent('system', 'synthesis_failed', 'batch', batchId, {
        error: (err as Error).message,
      });
      return NextResponse.json(
        { error: `AI synthesis failed: ${(err as Error).message}` },
        { status: 502 }
      );
    }

    const insertTheme = db.prepare(
      `INSERT INTO themes
       (id, batch_id, title, problem_statement, rationale, historical_comparison, pattern_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed')`
    );
    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO theme_feedback (theme_id, feedback_id) VALUES (?, ?)'
    );

    const createdThemeIds: string[] = [];

    const tx = db.transaction(() => {
      for (const proposal of result.proposals) {
        const themeId = uuid();
        // Pattern type is recomputed deterministically from validated citation
        // count, not taken verbatim from the model's own label.
        const patternType = proposal.cited_feedback_ids.length >= 2 ? 'recurring' : 'isolated';

        insertTheme.run(
          themeId,
          batchId,
          proposal.title,
          proposal.problem_statement,
          proposal.rationale,
          proposal.historical_comparison,
          patternType
        );
        for (const fid of proposal.cited_feedback_ids) {
          insertLink.run(themeId, fid);
        }
        createdThemeIds.push(themeId);
      }
    });
    tx();

    logEvent('ai', 'synthesis_completed', 'batch', batchId, {
      themes_created: createdThemeIds.length,
      items_considered: result.itemsConsidered,
      items_truncated: result.itemsTruncated,
      dropped_citations: result.droppedCitations,
      uncited_notes: result.uncitedNotes,
    });

    if (result.droppedCitations.length > 0) {
      logEvent('system', 'ai_hallucinated_citation_ids', 'batch', batchId, {
        detail: result.droppedCitations,
      });
    }

    return NextResponse.json({
      batch_id: batchId,
      theme_ids: createdThemeIds,
      items_considered: result.itemsConsidered,
      items_truncated: result.itemsTruncated,
      dropped_citations: result.droppedCitations,
      uncited_notes: result.uncitedNotes,
    });
  } catch (err) {
    console.error('synthesize error', err);
    return NextResponse.json({ error: 'Unexpected server error during synthesis.' }, { status: 500 });
  }
}
