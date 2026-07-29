import { describe, it, expect } from 'vitest';
import { parseAndValidateCsv } from '../lib/csv';

describe('parseAndValidateCsv', () => {
  it('parses valid rows with standard headers', () => {
    const csv = `feedback text,source,user type,product area,date,rating
"Export is broken",support,paid,dashboard,2026-05-01,2
"Love dark mode",survey,free,ui,2026-05-02,5`;

    const result = parseAndValidateCsv(csv);
    expect(result.missingRequiredFields).toHaveLength(0);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows[0].feedback_text).toBe('Export is broken');
    expect(result.validRows[0].rating).toBe(2);
  });

  it('treats an empty optional rating as null, not an error', () => {
    const csv = `feedback text,source,user type,product area,date,rating
"No rating given",support,paid,dashboard,2026-05-01,`;
    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].rating).toBeNull();
  });

  it('flags missing required columns instead of silently continuing', () => {
    const csv = `feedback text,source
"Missing fields",support`;
    const result = parseAndValidateCsv(csv);
    expect(result.missingRequiredFields).toEqual(
      expect.arrayContaining(['user_type', 'product_area', 'feedback_date'])
    );
    expect(result.validRows).toHaveLength(0);
  });

  it('rejects a row with a non-numeric rating and keeps other rows', () => {
    const csv = `feedback text,source,user type,product area,date,rating
"Bad rating",support,paid,dashboard,2026-05-01,not-a-number
"Good row",support,paid,dashboard,2026-05-02,3`;
    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/not a number/);
  });

  it('rejects rows missing a required value', () => {
    const csv = `feedback text,source,user type,product area,date,rating
,support,paid,dashboard,2026-05-01,3`;
    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('normalizes alternate header spellings', () => {
    const csv = `feedback,source,usertype,product_area,feedback_date,rating
"Alt headers work",support,paid,dashboard,2026-05-01,4`;
    const result = parseAndValidateCsv(csv);
    expect(result.missingRequiredFields).toHaveLength(0);
    expect(result.validRows).toHaveLength(1);
  });
});
