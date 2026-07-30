import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

// Some hosting dashboards' "raw editor" env-var UIs can end up storing (or
// merely displaying) a value like `"/data/app.db"` with the quote marks as
// literal characters. That breaks path.isAbsolute() and silently sends the
// database to the wrong (ephemeral) location instead of a mounted volume.
// Stripping any accidental surrounding quotes here makes this robust
// regardless of how the host's UI actually stores the value.
function cleanEnvPath(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = cleanEnvPath(process.env.DATABASE_PATH || './data/app.db');
  const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

  // Visible in `Deploy Logs` on every boot -- makes it obvious at a glance
  // whether the database is landing inside a mounted volume or not.
  console.log(`[db] DATABASE_PATH env: ${JSON.stringify(process.env.DATABASE_PATH)} -> resolved path: ${resolvedPath}`);

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}