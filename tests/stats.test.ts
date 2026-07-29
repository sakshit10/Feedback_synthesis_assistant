import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

const TEST_DB_PATH = path.join(process.cwd(), 'data', `test-${Date.now()}.db`);
process.env.DATABASE_PATH = TEST_DB_PATH;

// Imported after DATABASE_PATH is set so the module picks up the test path.
const { getDb } = await import('../lib/db');
const { computeThemeStats, computeBatchOverview } = await import('../lib/stats');

describe('computeThemeStats', () => {
  const batchId = uuid();
  const themeId = uuid();
  const otherThemeId = uuid();

  beforeAll(() => {
    const db = getDb();
    db.prepare('INSERT INTO batches (id, filename, row_count) VALUES (?, ?, ?)').run(
      batchId,
      'test.csv',
      4
    );
    db.prepare(
      `INSERT INTO themes (id, batch_id, title, problem_statement) VALUES (?, ?, 'Theme A', 'stmt')`
    ).run(themeId, batchId);
    db.prepare(
      `INSERT INTO themes (id, batch_id, title, problem_statement) VALUES (?, ?, 'Theme B', 'stmt')`
    ).run(otherThemeId, batchId);

    const items = [
      { id: uuid(), source: 'support', user_type: 'paid', date: '2026-05-01', rating: 2 },
      { id: uuid(), source: 'support', user_type: 'free', date: '2026-05-01', rating: 4 },
      { id: uuid(), source: 'survey', user_type: 'paid', date: '2026-06-15', rating: null },
      { id: uuid(), source: 'survey', user_type: 'paid', date: '2026-06-20', rating: null }, // linked to other theme
    ];

    const insertFeedback = db.prepare(
      `INSERT INTO feedback_items (id, batch_id, feedback_text, source, user_type, product_area, feedback_date, rating)
       VALUES (?, ?, 'text', ?, ?, 'area', ?, ?)`
    );
    for (const it of items) {
      insertFeedback.run(it.id, batchId, it.source, it.user_type, it.date, it.rating);
    }

    const insertLink = db.prepare('INSERT INTO theme_feedback (theme_id, feedback_id) VALUES (?, ?)');
    insertLink.run(themeId, items[0].id);
    insertLink.run(themeId, items[1].id);
    insertLink.run(themeId, items[2].id);
    insertLink.run(otherThemeId, items[3].id);
  });

  afterAll(() => {
    getDb().close();
    for (const suffix of ['', '-wal', '-shm']) {
      const p = TEST_DB_PATH + suffix;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('counts only feedback actually linked to the theme, not other themes', () => {
    const stats = computeThemeStats(themeId);
    expect(stats.feedback_count).toBe(3);
  });

  it('computes source distribution deterministically from linked rows', () => {
    const stats = computeThemeStats(themeId);
    expect(stats.source_distribution).toEqual({ support: 2, survey: 1 });
  });

  it('computes user type distribution deterministically', () => {
    const stats = computeThemeStats(themeId);
    expect(stats.user_type_distribution).toEqual({ paid: 2, free: 1 });
  });

  it('buckets frequency by calendar month', () => {
    const stats = computeThemeStats(themeId);
    expect(stats.frequency_by_month).toEqual({ '2026-05': 2, '2026-06': 1 });
  });

  it('averages only non-null ratings and ignores nulls in the denominator', () => {
    const stats = computeThemeStats(themeId);
    // ratings present: 2 and 4 -> average 3; the null rating is excluded, not treated as 0
    expect(stats.average_rating).toBe(3);
  });

  it('returns zero count for a theme with no linked feedback', () => {
    const db = getDb();
    const emptyThemeId = uuid();
    db.prepare(
      `INSERT INTO themes (id, batch_id, title, problem_statement) VALUES (?, ?, 'Empty', 'stmt')`
    ).run(emptyThemeId, batchId);
    const stats = computeThemeStats(emptyThemeId);
    expect(stats.feedback_count).toBe(0);
    expect(stats.average_rating).toBeNull();
  });

  it('computeBatchOverview reflects themed vs unthemed totals', () => {
    const overview = computeBatchOverview(batchId);
    expect(overview.total_feedback).toBe(4);
    expect(overview.themed_feedback).toBe(4); // all 4 items are linked to some theme
    expect(overview.unthemed_feedback).toBe(0);
  });
});
