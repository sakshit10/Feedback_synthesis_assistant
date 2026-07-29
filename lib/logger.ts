import { v4 as uuid } from 'uuid';
import { getDb } from './db';

export type Actor = 'ai' | 'human' | 'system';

export function logEvent(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>
) {
  const db = getDb();
  const id = uuid();
  const detailsJson = details ? JSON.stringify(details) : null;

  db.prepare(
    `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, actor, action, entityType, entityId, detailsJson);

  // Also emit to stdout so logs are visible in hosting platform's log stream.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      actor,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    })
  );

  return id;
}

export function getAuditLog(entityId?: string, limit = 200) {
  const db = getDb();
  if (entityId) {
    return db
      .prepare('SELECT * FROM audit_log WHERE entity_id = ? ORDER BY ts DESC LIMIT ?')
      .all(entityId, limit);
  }
  return db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').all(limit);
}
