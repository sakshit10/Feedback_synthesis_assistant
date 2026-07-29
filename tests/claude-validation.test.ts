import { describe, it, expect } from 'vitest';
import { parseModelJson, validateCitations } from '../lib/claude';
import type { AiThemeProposal } from '../lib/types';

describe('parseModelJson', () => {
  it('parses clean JSON output', () => {
    const raw = JSON.stringify({ themes: [], uncited_notes: null });
    const result = parseModelJson(raw);
    expect(result.themes).toEqual([]);
  });

  it('strips markdown fences the model adds despite instructions not to', () => {
    const raw = '```json\n{"themes": []}\n```';
    const result = parseModelJson(raw);
    expect(result.themes).toEqual([]);
  });

  it('throws a descriptive error on malformed JSON rather than silently failing', () => {
    expect(() => parseModelJson('not json at all')).toThrow(/did not return valid JSON/);
  });

  it('throws if themes is missing or not an array', () => {
    expect(() => parseModelJson(JSON.stringify({ themes: 'oops' }))).toThrow();
    expect(() => parseModelJson(JSON.stringify({}))).toThrow();
  });
});

describe('validateCitations', () => {
  const baseTheme: AiThemeProposal = {
    temp_id: 't1',
    title: 'Export fails',
    problem_statement: 'stmt',
    rationale: 'rationale',
    historical_comparison: 'none',
    pattern_type: 'recurring',
    cited_feedback_ids: [],
  };

  it('keeps citations that correspond to real feedback IDs', () => {
    const validIds = new Set(['a', 'b', 'c']);
    const themes = [{ ...baseTheme, cited_feedback_ids: ['a', 'b'] }];
    const { cleanedThemes, droppedCitations } = validateCitations(themes, validIds);
    expect(cleanedThemes[0].cited_feedback_ids).toEqual(['a', 'b']);
    expect(droppedCitations).toHaveLength(0);
  });

  it('drops and reports hallucinated IDs instead of trusting them', () => {
    const validIds = new Set(['a', 'b']);
    const themes = [{ ...baseTheme, cited_feedback_ids: ['a', 'made-up-id', 'b'] }];
    const { cleanedThemes, droppedCitations } = validateCitations(themes, validIds);
    expect(cleanedThemes[0].cited_feedback_ids).toEqual(['a', 'b']);
    expect(droppedCitations).toEqual([{ theme_temp_id: 't1', bad_ids: ['made-up-id'] }]);
  });

  it('handles a theme where every citation is invalid', () => {
    const validIds = new Set(['a']);
    const themes = [{ ...baseTheme, cited_feedback_ids: ['x', 'y'] }];
    const { cleanedThemes, droppedCitations } = validateCitations(themes, validIds);
    expect(cleanedThemes[0].cited_feedback_ids).toEqual([]);
    expect(droppedCitations[0].bad_ids).toEqual(['x', 'y']);
  });

  it('does not mutate the input theme objects', () => {
    const validIds = new Set(['a']);
    const original = { ...baseTheme, cited_feedback_ids: ['a', 'bad'] };
    validateCitations([original], validIds);
    expect(original.cited_feedback_ids).toEqual(['a', 'bad']);
  });
});
