import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath =
    process.env.DATABASE_PATH ||
    (process.env.NETLIFY
      ? '/tmp/app.db'
      : './data/app.db');

  const resolvedPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.join(process.cwd(), dbPath);

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  return db;
}