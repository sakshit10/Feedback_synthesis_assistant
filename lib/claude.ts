import type { FeedbackItem, HistoricalNote, AiSynthesisResponse, AiThemeProposal } from './types';

const MAX_ITEMS_PER_CALL = 400; // see README "Known limitations" for larger datasets
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// OpenRouter exposes an OpenAI-compatible endpoint, so we call it directly
// with fetch instead of pulling in a provider-specific SDK. This also makes
// it trivial to swap providers later -- only this file changes.
async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local (local) or your host's environment variables (deployed). See .env.example."
    );
  }

  // Free (":free") model IDs on OpenRouter rotate frequently as providers
  // add/remove them. Check https://openrouter.ai/models?max_price=0 for the
  // current list and set OPENROUTER_MODEL accordingly if the default below
  // has been delisted.
  const model = process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder:free';

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_PUBLIC_URL || 'http://localhost:3000',
      'X-Title': 'AI Product Feedback Synthesis Assistant',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(
      `OpenRouter request failed (${res.status}) for model "${model}": ${bodyText.slice(0, 500)}. ` +
        `If this is a 404 or "no endpoints found", the free model was likely delisted -- check https://openrouter.ai/models?max_price=0 and update OPENROUTER_MODEL.`
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`OpenRouter returned no content. Raw response (truncated): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return content;
}

function buildSystemPrompt(): string {
  return `You are a product-feedback analyst assistant. You group raw user feedback into
themes for a human product team to review. You must follow these rules exactly:

1. You will be given a numbered list of feedback items, each with a stable ID.
   Every "cited_feedback_ids" entry you output MUST be copied exactly from the
   IDs you were given. Never invent an ID. Never cite an ID that was not given
   to you.
2. Do NOT report counts, percentages, or statistics anywhere in your output.
   Counting is done by a separate deterministic system from your citations.
   Your job is only to decide which feedback items belong to which theme.
3. Group feedback into themes based on the underlying problem being described,
   not surface wording. A theme should represent one coherent product problem.
4. For each theme, write a proposed problem statement a PM could act on:
   what is broken, for whom, and in what context — grounded only in the cited
   feedback, not assumptions.
5. Compare each theme against the provided historical notes. If a note appears
   related, name it and explain the relationship in "historical_comparison".
   If nothing relates, say so explicitly rather than leaving it vague.
6. Suggest "recurring" if the theme clearly reflects a pattern across multiple
   distinct feedback items, or "isolated" if it is really just one comment
   that doesn't yet show a pattern. This is a starting judgment only — the
   final label is recomputed deterministically from your citations downstream.
7. Do not merge unrelated problems into one theme to reduce theme count, and
   do not split one problem into many near-duplicate themes.
8. Do not propose a product roadmap, priority order, or recommend which theme
   to fix first. That decision belongs to the human reviewer.
9. Respond with ONLY valid JSON matching this exact shape, and nothing else —
   no markdown fences, no commentary before or after:

{
  "themes": [
    {
      "temp_id": "string, e.g. t1",
      "title": "short theme title",
      "problem_statement": "1-3 sentence proposed problem statement",
      "rationale": "why these feedback items were grouped together",
      "historical_comparison": "relationship to provided historical notes, or explicit 'no related historical note'",
      "pattern_type": "recurring" | "isolated",
      "cited_feedback_ids": ["id1", "id2"]
    }
  ],
  "uncited_notes": "optional: feedback you saw but could not confidently place in any theme, and why"
}`;
}

function buildUserPrompt(items: FeedbackItem[], notes: HistoricalNote[]): string {
  const feedbackBlock = items
    .map(
      (f) =>
        `- id: ${f.id}\n  text: ${f.feedback_text.replace(/\n/g, ' ')}\n  source: ${f.source} | user_type: ${f.user_type} | product_area: ${f.product_area} | date: ${f.feedback_date}${f.rating != null ? ` | rating: ${f.rating}` : ''}`
    )
    .join('\n');

  const notesBlock =
    notes.length > 0
      ? notes.map((n) => `- ${n.title}: ${n.content}`).join('\n')
      : '(no historical notes provided)';

  return `FEEDBACK ITEMS (${items.length} total):\n${feedbackBlock}\n\nHISTORICAL THEMES / PRODUCT NOTES:\n${notesBlock}\n\nProduce the JSON synthesis now.`;
}

export interface SynthesisRunResult {
  proposals: AiThemeProposal[];
  uncitedNotes: string | null;
  rawModel: string;
  droppedCitations: { theme_temp_id: string; bad_ids: string[] }[];
  itemsConsidered: number;
  itemsTruncated: boolean;
}

export async function runSynthesis(
  items: FeedbackItem[],
  notes: HistoricalNote[]
): Promise<SynthesisRunResult> {
  const truncated = items.length > MAX_ITEMS_PER_CALL;
  const usedItems = truncated ? items.slice(0, MAX_ITEMS_PER_CALL) : items;

  const rawModel = await callOpenRouter(buildSystemPrompt(), buildUserPrompt(usedItems, notes));

  const parsed = parseModelJson(rawModel);
  const validIds = new Set(usedItems.map((i) => i.id));
  const { cleanedThemes, droppedCitations } = validateCitations(parsed.themes, validIds);

  return {
    proposals: cleanedThemes.filter((t) => t.cited_feedback_ids.length > 0),
    uncitedNotes: parsed.uncited_notes ?? null,
    rawModel,
    droppedCitations,
    itemsConsidered: usedItems.length,
    itemsTruncated: truncated,
  };
}

/**
 * The trust boundary between "what the model claimed" and "what we'll persist".
 * Any cited feedback ID that doesn't correspond to a real row we sent the model
 * is stripped out and reported, never silently kept and never silently dropped
 * without a trace in the audit log (see app/api/synthesize/route.ts).
 */
export function validateCitations(
  themes: AiThemeProposal[],
  validIds: Set<string>
): {
  cleanedThemes: AiThemeProposal[];
  droppedCitations: { theme_temp_id: string; bad_ids: string[] }[];
} {
  const droppedCitations: { theme_temp_id: string; bad_ids: string[] }[] = [];
  const cleanedThemes: AiThemeProposal[] = themes.map((t) => {
    const good = t.cited_feedback_ids.filter((id) => validIds.has(id));
    const bad = t.cited_feedback_ids.filter((id) => !validIds.has(id));
    if (bad.length > 0) {
      droppedCitations.push({ theme_temp_id: t.temp_id, bad_ids: bad });
    }
    return { ...t, cited_feedback_ids: good };
  });
  return { cleanedThemes, droppedCitations };
}

export function parseModelJson(raw: string): AiSynthesisResponse {
  let text = raw.trim();
  // defensive: strip markdown fences if the model adds them despite instructions
  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.themes)) throw new Error('themes is not an array');
    return parsed as AiSynthesisResponse;
  } catch (err) {
    throw new Error(
      `Model did not return valid JSON: ${(err as Error).message}. Raw output (truncated): ${text.slice(0, 500)}`
    );
  }
}