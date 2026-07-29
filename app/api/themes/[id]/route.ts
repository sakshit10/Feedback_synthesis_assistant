import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logEvent } from '@/lib/logger';
import type { Theme } from '@/lib/types';

const ALLOWED_ACTIONS = ['rename', 'edit_problem_statement', 'approve', 'reject'] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(params.id) as Theme | undefined;

  if (!theme) {
    return NextResponse.json({ error: 'Theme not found.' }, { status: 404 });
  }

  const body = await req.json();
  const action: Action = body?.action;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${ALLOWED_ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  if (action === 'rename') {
    const title: string = (body.title ?? '').trim();
    if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
    db.prepare("UPDATE themes SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
      title,
      theme.id
    );
    logEvent('human', 'rename_theme', 'theme', theme.id, { from: theme.title, to: title });
  }

  if (action === 'edit_problem_statement') {
    const statement: string = (body.problem_statement ?? '').trim();
    if (!statement)
      return NextResponse.json({ error: 'problem_statement is required.' }, { status: 400 });
    db.prepare(
      "UPDATE themes SET problem_statement = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(statement, theme.id);
    logEvent('human', 'edit_problem_statement', 'theme', theme.id, {
      from: theme.problem_statement,
      to: statement,
    });
  }

  if (action === 'approve') {
    db.prepare("UPDATE themes SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(
      theme.id
    );
    logEvent('human', 'approve_theme', 'theme', theme.id, {});
  }

  if (action === 'reject') {
    const reason = (body.reason ?? '').trim();
    db.prepare("UPDATE themes SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(
      theme.id
    );
    logEvent('human', 'reject_theme', 'theme', theme.id, { reason: reason || null });
  }

  const updated = db.prepare('SELECT * FROM themes WHERE id = ?').get(theme.id);
  return NextResponse.json({ theme: updated });
}
