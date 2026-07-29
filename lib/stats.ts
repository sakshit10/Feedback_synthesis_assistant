import { getDb } from './db';
import type { ThemeStats, FeedbackItem } from './types';

/**
 * All numbers here come from SQL aggregation over theme_feedback + feedback_items.
 * The AI model never supplies a count — it only supplies which feedback IDs
 * support a theme, and this module counts them. See lib/claude.ts for how
 * citations are validated against real rows before they ever reach this file.
 */
export function computeThemeStats(themeId: string): ThemeStats {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT f.* FROM feedback_items f
       JOIN theme_feedback tf ON tf.feedback_id = f.id
       WHERE tf.theme_id = ?`
    )
    .all(themeId) as FeedbackItem[];

  const source_distribution: Record<string, number> = {};
  const user_type_distribution: Record<string, number> = {};
  const frequency_by_month: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;

  for (const row of rows) {
    source_distribution[row.source] = (source_distribution[row.source] ?? 0) + 1;
    user_type_distribution[row.user_type] = (user_type_distribution[row.user_type] ?? 0) + 1;

    const month = row.feedback_date.slice(0, 7); // YYYY-MM
    frequency_by_month[month] = (frequency_by_month[month] ?? 0) + 1;

    if (row.rating !== null && row.rating !== undefined) {
      ratingSum += row.rating;
      ratingCount += 1;
    }
  }

  return {
    feedback_count: rows.length,
    source_distribution,
    user_type_distribution,
    frequency_by_month,
    average_rating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : null,
  };
}

export function computeBatchOverview(batchId: string) {
  const db = getDb();

  const totalFeedback = (
    db.prepare('SELECT COUNT(*) as c FROM feedback_items WHERE batch_id = ?').get(batchId) as {
      c: number;
    }
  ).c;

  const themedFeedback = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT tf.feedback_id) as c
         FROM theme_feedback tf
         JOIN themes t ON t.id = tf.theme_id
         JOIN feedback_items f ON f.id = tf.feedback_id
         WHERE f.batch_id = ? AND t.status != 'rejected'`
      )
      .get(batchId) as { c: number }
  ).c;

  return {
    total_feedback: totalFeedback,
    themed_feedback: themedFeedback,
    unthemed_feedback: totalFeedback - themedFeedback,
  };
}
