import Papa from 'papaparse';
import { z } from 'zod';

// Accept a range of plausible header spellings and normalize them.
const HEADER_ALIASES: Record<string, string> = {
  'feedback text': 'feedback_text',
  feedback_text: 'feedback_text',
  feedback: 'feedback_text',
  source: 'source',
  'user type': 'user_type',
  user_type: 'user_type',
  usertype: 'user_type',
  'product area': 'product_area',
  product_area: 'product_area',
  date: 'feedback_date',
  'feedback date': 'feedback_date',
  feedback_date: 'feedback_date',
  rating: 'rating',
  'optional rating': 'rating',
};

const REQUIRED_FIELDS = ['feedback_text', 'source', 'user_type', 'product_area', 'feedback_date'];

export interface CsvRowError {
  row: number; // 1-indexed, matches spreadsheet row incl. header offset
  message: string;
}

export interface CsvValidationResult {
  validRows: ParsedFeedbackRow[];
  errors: CsvRowError[];
  detectedHeaders: string[];
  missingRequiredFields: string[];
}

export interface ParsedFeedbackRow {
  feedback_text: string;
  source: string;
  user_type: string;
  product_area: string;
  feedback_date: string;
  rating: number | null;
}

const rowSchema = z.object({
  feedback_text: z.string().trim().min(1, 'feedback text is empty'),
  source: z.string().trim().min(1, 'source is empty'),
  user_type: z.string().trim().min(1, 'user type is empty'),
  product_area: z.string().trim().min(1, 'product area is empty'),
  feedback_date: z.string().trim().min(1, 'date is empty'),
  rating: z.number().nullable(),
});

function normalizeHeader(h: string): string | null {
  const key = h.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? null;
}

function normalizeDate(raw: string): { value: string; ok: boolean } {
  const trimmed = raw.trim();
  const isoMatch = /^\d{4}-\d{2}-\d{2}/.test(trimmed);
  if (isoMatch) return { value: trimmed.slice(0, 10), ok: true };

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return { value: parsed.toISOString().slice(0, 10), ok: true };
  }
  return { value: trimmed, ok: false };
}

export function parseAndValidateCsv(fileContent: string): CsvValidationResult {
  const parsed = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  const rawHeaders = parsed.meta.fields ?? [];
  const headerMap = new Map<string, string>(); // normalized -> original
  for (const h of rawHeaders) {
    const normalized = normalizeHeader(h);
    if (normalized) headerMap.set(normalized, h);
  }

  const missingRequiredFields = REQUIRED_FIELDS.filter((f) => !headerMap.has(f));

  const errors: CsvRowError[] = [];
  const validRows: ParsedFeedbackRow[] = [];

  if (missingRequiredFields.length > 0) {
    return {
      validRows: [],
      errors: [
        {
          row: 0,
          message: `CSV is missing required column(s): ${missingRequiredFields.join(', ')}`,
        },
      ],
      detectedHeaders: rawHeaders,
      missingRequiredFields,
    };
  }

  parsed.data.forEach((row, idx) => {
    const rowNumber = idx + 2; // account for header row, 1-indexed
    const get = (field: string) => {
      const orig = headerMap.get(field);
      return orig ? (row[orig] ?? '') : '';
    };

    const ratingRaw = get('rating');
    let rating: number | null = null;
    if (ratingRaw && ratingRaw.trim() !== '') {
      const n = Number(ratingRaw);
      if (isNaN(n)) {
        errors.push({ row: rowNumber, message: `rating "${ratingRaw}" is not a number` });
        return;
      }
      rating = n;
    }

    const { value: dateValue, ok: dateOk } = normalizeDate(get('feedback_date'));
    if (!dateOk) {
      errors.push({ row: rowNumber, message: `date "${get('feedback_date')}" could not be parsed` });
      return;
    }

    const candidate = {
      feedback_text: get('feedback_text'),
      source: get('source'),
      user_type: get('user_type'),
      product_area: get('product_area'),
      feedback_date: dateValue,
      rating,
    };

    const result = rowSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        row: rowNumber,
        message: result.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    validRows.push(result.data);
  });

  return { validRows, errors, detectedHeaders: rawHeaders, missingRequiredFields };
}
