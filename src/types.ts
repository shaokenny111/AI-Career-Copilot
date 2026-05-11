export type Confidence = 'High' | 'Medium' | 'Low';

export interface Suggestion {
  issue: string;
  reason: string;
  action: string;
}

export interface KeywordMatch {
  matched: string[];
  missing: string[];
}

export interface MatchBreakdown {
  skills: number;
  experience: number;
  tools: number;
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  score: number;
  confidence: Confidence;
  summary: string;
  match_breakdown: MatchBreakdown;
  strengths: string[];
  gaps: string[];
  suggestions: Suggestion[];
  keyword_match: KeywordMatch;
  jd: string; // Preview of the JD
}

