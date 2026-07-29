import type { HistoricalNote, ThemeWithStats } from './types';

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function uploadCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  return handle<{ batch_id: string; valid_row_count: number; row_errors: { row: number; message: string }[] }>(
    res
  );
}

export async function runSynthesis(batchId: string) {
  const res = await fetch('/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId }),
  });
  return handle<{
    theme_ids: string[];
    items_considered: number;
    items_truncated: boolean;
    dropped_citations: { theme_temp_id: string; bad_ids: string[] }[];
    uncited_notes: string | null;
  }>(res);
}

export async function fetchThemes(batchId: string) {
  const res = await fetch(`/api/themes?batch_id=${encodeURIComponent(batchId)}`);
  return handle<{ themes: ThemeWithStats[]; overview: { total_feedback: number; themed_feedback: number; unthemed_feedback: number } }>(
    res
  );
}

export async function patchTheme(themeId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/themes/${themeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<{ theme: unknown }>(res);
}

export async function mergeThemes(targetId: string, sourceThemeIds: string[]) {
  const res = await fetch(`/api/themes/${targetId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_theme_ids: sourceThemeIds }),
  });
  return handle<{ theme: unknown }>(res);
}

export async function splitTheme(
  themeId: string,
  groups: { title: string; problem_statement: string; feedback_ids: string[] }[]
) {
  const res = await fetch(`/api/themes/${themeId}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups }),
  });
  return handle<{ new_theme_ids: string[] }>(res);
}

export async function fetchThemeFeedback(themeId: string) {
  const res = await fetch(`/api/feedback/${themeId}`);
  return handle<{ theme: { id: string; title: string }; feedback: any[] }>(res);
}

export async function fetchHistoricalNotes() {
  const res = await fetch('/api/historical-notes');
  return handle<{ notes: HistoricalNote[] }>(res);
}

export async function addHistoricalNote(title: string, content: string) {
  const res = await fetch('/api/historical-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  return handle<{ note: HistoricalNote }>(res);
}

export async function saveReport(batchId: string) {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId }),
  });
  return handle<{ report_id: string; snapshot: unknown }>(res);
}

export async function fetchReport(batchId: string) {
  const res = await fetch(`/api/report?batch_id=${encodeURIComponent(batchId)}`);
  return handle<{ report: { id: string; snapshot: unknown; created_at: string } | null }>(res);
}
