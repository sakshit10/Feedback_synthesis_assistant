import OpenAI from "openai";
import type {
  FeedbackItem,
  HistoricalNote,
  AiSynthesisResponse,
  AiThemeProposal,
} from "./types";

const MAX_ITEMS_PER_CALL = 400;

function getClient(): OpenAI {
  console.log("=== ENV DEBUG ===");
  console.log(
    "OPENROUTER_API_KEY exists:",
    !!process.env.OPENROUTER_API_KEY
  );
  console.log(
    "OPENROUTER_MODEL:",
    process.env.OPENROUTER_MODEL
  );
  console.log(
    "Available env vars:",
    Object.keys(process.env).filter((k) =>
      k.includes("OPENROUTER")
    )
  );
  console.log("=================");

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on Railway."
    );
  }

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
}

function buildSystemPrompt(): string {
  return `You are a product-feedback analyst assistant.

Respond ONLY with valid JSON.

{
  "themes":[
    {
      "temp_id":"t1",
      "title":"Theme",
      "problem_statement":"...",
      "rationale":"...",
      "historical_comparison":"...",
      "pattern_type":"recurring",
      "cited_feedback_ids":["id1"]
    }
  ],
  "uncited_notes":""
}`;
}

function buildUserPrompt(
  items: FeedbackItem[],
  notes: HistoricalNote[]
): string {
  const feedbackBlock = items
    .map(
      (f) =>
        `- id:${f.id}
text:${f.feedback_text}
source:${f.source}
user_type:${f.user_type}
product_area:${f.product_area}
date:${f.feedback_date}`
    )
    .join("\n");

  const notesBlock =
    notes.length === 0
      ? "(no historical notes)"
      : notes.map((n) => `- ${n.title}: ${n.content}`).join("\n");

  return `Feedback:

${feedbackBlock}

Historical Notes:

${notesBlock}`;
}

export interface SynthesisRunResult {
  proposals: AiThemeProposal[];
  uncitedNotes: string | null;
  rawModel: string;
  droppedCitations: {
    theme_temp_id: string;
    bad_ids: string[];
  }[];
  itemsConsidered: number;
  itemsTruncated: boolean;
}

export async function runSynthesis(
  items: FeedbackItem[],
  notes: HistoricalNote[]
): Promise<SynthesisRunResult> {
  const truncated = items.length > MAX_ITEMS_PER_CALL;
  const usedItems = truncated ? items.slice(0, MAX_ITEMS_PER_CALL) : items;

  const client = getClient();

  const model =
    process.env.OPENROUTER_MODEL ||
    "meta-llama/llama-3.3-70b-instruct";

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: buildUserPrompt(usedItems, notes),
      },
    ],
  });

  const rawModel =
    response.choices[0]?.message?.content || "";

  const parsed = parseModelJson(rawModel);

  const validIds = new Set(usedItems.map((i) => i.id));

  const { cleanedThemes, droppedCitations } =
    validateCitations(parsed.themes, validIds);

  return {
    proposals: cleanedThemes.filter(
      (t) => t.cited_feedback_ids.length > 0
    ),
    uncitedNotes: parsed.uncited_notes ?? null,
    rawModel,
    droppedCitations,
    itemsConsidered: usedItems.length,
    itemsTruncated: truncated,
  };
}

export function validateCitations(
  themes: AiThemeProposal[],
  validIds: Set<string>
) {
  const droppedCitations: {
    theme_temp_id: string;
    bad_ids: string[];
  }[] = [];

  const cleanedThemes = themes.map((t) => {
    const good = t.cited_feedback_ids.filter((id) =>
      validIds.has(id)
    );

    const bad = t.cited_feedback_ids.filter(
      (id) => !validIds.has(id)
    );

    if (bad.length) {
      droppedCitations.push({
        theme_temp_id: t.temp_id,
        bad_ids: bad,
      });
    }

    return {
      ...t,
      cited_feedback_ids: good,
    };
  });

  return {
    cleanedThemes,
    droppedCitations,
  };
}

export function parseModelJson(raw: string): AiSynthesisResponse {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(json)?/, "")
      .replace(/```$/, "")
      .trim();
  }

  const parsed = JSON.parse(text);

  return parsed as AiSynthesisResponse;
}