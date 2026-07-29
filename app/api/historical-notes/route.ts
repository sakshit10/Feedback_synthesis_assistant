import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { logEvent } from '@/lib/logger';

export async function GET() {
  const db = getDb();
  const notes = db.prepare('SELECT * FROM historical_notes ORDER BY created_at ASC').all();
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title: string = (body?.title ?? '').trim();
  const content: string = (body?.content ?? '').trim();

  if (!title || !content) {
    return NextResponse.json({ error: 'title and content are required.' }, { status: 400 });
  }

  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO historical_notes (id, title, content) VALUES (?, ?, ?)').run(
    id,
    title,
    content
  );
  logEvent('human', 'add_historical_note', 'historical_note', id, { title });

  const note = db.prepare('SELECT * FROM historical_notes WHERE id = ?').get(id);
  return NextResponse.json({ note });
}
