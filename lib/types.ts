export interface FeedbackItem {
  id: string;
  batch_id: string;
  feedback_text: string;
  source: string;
  user_type: string;
  product_area: string;
  feedback_date: string;
  rating: number | null;
  created_at: string;
}

export type ThemeStatus = 'proposed' | 'approved' | 'rejected' | 'merged' | 'split';
export type PatternType = 'recurring' | 'isolated' | 'unclassified';

export interface Theme {
  id: string;
  batch_id: string;
  title: string;
  problem_statement: string;
  rationale: string;
  historical_comparison: string;
  pattern_type: PatternType;
  status: ThemeStatus;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeStats {
  feedback_count: number;
  source_distribution: Record<string, number>;
  user_type_distribution: Record<string, number>;
  frequency_by_month: Record<string, number>;
  average_rating: number | null;
}

export interface ThemeWithStats extends Theme {
  stats: ThemeStats;
  cited_feedback_ids: string[];
  dropped_citation_count: number;
}

export interface HistoricalNote {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

// Shape the AI model is instructed to return. This is a *proposal only* —
// every field is treated as untrusted until cross-checked against the DB.
export interface AiThemeProposal {
  temp_id: string;
  title: string;
  problem_statement: string;
  rationale: string;
  historical_comparison: string;
  pattern_type: 'recurring' | 'isolated';
  cited_feedback_ids: string[];
}

export interface AiSynthesisResponse {
  themes: AiThemeProposal[];
  uncited_notes?: string;
}
