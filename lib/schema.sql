-- Feedback Synthesis Assistant — SQLite schema
-- All counts and distributions shown in the UI are derived from these tables
-- via deterministic SQL queries (see lib/stats.ts), never from AI output.

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  feedback_text TEXT NOT NULL,
  source TEXT NOT NULL,
  user_type TEXT NOT NULL,
  product_area TEXT NOT NULL,
  feedback_date TEXT NOT NULL,
  rating REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_batch ON feedback_items(batch_id);

CREATE TABLE IF NOT EXISTS historical_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  historical_comparison TEXT NOT NULL DEFAULT '',
  pattern_type TEXT NOT NULL DEFAULT 'unclassified', -- 'recurring' | 'isolated' | 'unclassified'
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | rejected | merged | split
  merged_into TEXT REFERENCES themes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_themes_batch ON themes(batch_id);

-- Links a feedback item to the theme(s) it supports. A feedback item can
-- support more than one theme (e.g. it mentions two distinct problems),
-- but every citation must point at a feedback_items.id that actually exists;
-- unresolved AI citations are dropped and logged (see lib/claude.ts).
CREATE TABLE IF NOT EXISTS theme_feedback (
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  feedback_id TEXT NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  PRIMARY KEY (theme_id, feedback_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL, -- 'ai' | 'human' | 'system'
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT -- JSON string
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL, -- JSON string of the full reviewed synthesis
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
