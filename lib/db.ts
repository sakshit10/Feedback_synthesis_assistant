import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

// Some hosting dashboards' env-var editors have proven unreliable at
// actually propagating an updated DATABASE_PATH to the running container
// (verified via a boot-time log line showing the old default persisting
// across several edits/redeploys). Rather than depend entirely on that
// variable reaching the container correctly, auto-detect a commonly-used
// mounted-volume directory and prefer it whenever DATABASE_PATH itself
// isn't already pointing at an absolute, non-default location.
const COMMON_VOLUME_MOUNTS = ['/data', '/app/data', '/mnt/data'];

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

function detectMountedVolume(): string | null {
  for (const mount of COMMON_VOLUME_MOUNTS) {
    try {
      if (fs.existsSync(mount) && fs.statSync(mount).isDirectory()) {
        return mount;
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return null;
}

function resolveDbPath(): string {
  const rawEnv = process.env.DATABASE_PATH;
  const cleaned = rawEnv ? cleanEnvPath(rawEnv) : null;

  // If DATABASE_PATH is already an absolute path, trust it as-is -- an
  // operator who explicitly set an absolute path knows what they want.
  if (cleaned && path.isAbsolute(cleaned)) {
    return cleaned;
  }

  // Otherwise, prefer a detected mounted volume over the relative default,
  // since a relative path resolves inside the container's ephemeral
  // filesystem and gets wiped on every redeploy.
  const mounted = detectMountedVolume();
  if (mounted) {
    return path.join(mounted, 'app.db');
  }

  // No volume detected (e.g. local dev) -- fall back to the relative default.
  return cleaned ? path.join(process.cwd(), cleaned) : path.join(process.cwd(), './data/app.db');
}

export function getDb(): Database.Database {
  if (db) return db;

  const resolvedPath = resolveDbPath();

  // Visible in `Deploy Logs` on every boot -- makes it obvious at a glance
  // whether the database is landing inside a mounted volume or not.
  console.log(
    `[db] DATABASE_PATH env: ${JSON.stringify(process.env.DATABASE_PATH)} -> resolved path: ${resolvedPath}`
  );

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}