import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { parseAndValidateCsv } from '@/lib/csv';
import { logEvent } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided. Attach a CSV under field "file".' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a .csv file.' }, { status: 400 });
    }

    const content = await file.text();
    const result = parseAndValidateCsv(content);

    if (result.missingRequiredFields.length > 0) {
      return NextResponse.json(
        {
          error: 'CSV is missing required columns.',
          missingRequiredFields: result.missingRequiredFields,
          detectedHeaders: result.detectedHeaders,
        },
        { status: 422 }
      );
    }

    if (result.validRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found in CSV.', rowErrors: result.errors },
        { status: 422 }
      );
    }

    const db = getDb();
    const batchId = uuid();

    const insertBatch = db.prepare(
      'INSERT INTO batches (id, filename, row_count) VALUES (?, ?, ?)'
    );
    const insertFeedback = db.prepare(
      `INSERT INTO feedback_items
       (id, batch_id, feedback_text, source, user_type, product_area, feedback_date, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      insertBatch.run(batchId, file.name, result.validRows.length);
      for (const row of result.validRows) {
        insertFeedback.run(
          uuid(),
          batchId,
          row.feedback_text,
          row.source,
          row.user_type,
          row.product_area,
          row.feedback_date,
          row.rating
        );
      }
    });
    tx();

    logEvent('human', 'upload_csv', 'batch', batchId, {
      filename: file.name,
      valid_rows: result.validRows.length,
      row_errors: result.errors.length,
    });

    return NextResponse.json({
      batch_id: batchId,
      valid_row_count: result.validRows.length,
      row_errors: result.errors,
    });
  } catch (err) {
    console.error('upload error', err);
    return NextResponse.json({ error: 'Unexpected server error during upload.' }, { status: 500 });
  }
}
