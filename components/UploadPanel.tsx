'use client';

import { useRef, useState } from 'react';
import { uploadCsv } from '@/lib/apiClient';

interface Props {
  onUploaded: (batchId: string, filename: string, validRows: number) => void;
}

export function UploadPanel({ onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus('uploading');
    setError(null);
    setRowErrors([]);
    try {
      const result = await uploadCsv(file);
      setRowErrors(result.row_errors ?? []);
      setStatus('idle');
      onUploaded(result.batch_id, file.name, result.valid_row_count);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  return (
    <div className="rounded border border-line bg-white p-5">
      <h2 className="font-display text-lg text-ink">Upload feedback CSV</h2>
      <p className="mt-1 text-sm text-slate">
        Required columns: feedback text, source, user type, product area, date. Rating is optional.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <input
  id="csv-upload"
  ref={inputRef}
  type="file"
  accept=".csv,text/csv,application/vnd.ms-excel"
  className="hidden"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      e.target.value = "";
    }
  }}
/>

<label
  htmlFor="csv-upload"
  className="btn-primary cursor-pointer"
>
  {status === "uploading" ? "Uploading..." : "Choose CSV file"}
</label>
        <a href="/sample-feedback.csv" download className="text-xs text-slate underline hover:text-ink">
          download a sample CSV
        </a>
      </div>

      {status === 'error' && error && (
        <div className="mt-4 rounded-sm border border-rust/30 bg-rust/5 p-3 text-sm text-rust">
          Upload failed: {error}
        </div>
      )}

      {rowErrors.length > 0 && (
        <div className="mt-4 rounded-sm border border-amber/40 bg-amber/5 p-3 text-sm">
          <p className="font-medium text-ink">
            {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} were skipped:
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate">
            {rowErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.message}
              </li>
            ))}
            {rowErrors.length > 20 && <li>…and {rowErrors.length - 20} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
