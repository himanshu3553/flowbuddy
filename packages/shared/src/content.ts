// The structured content model (PRD §6.2). Stored in Postgres; this is the
// in-memory/transport shape used by synthesis, Studio, and the portal.

export type ArticleSource = 'recording_auto' | 'prompt_grounded' | 'manual' | 'import';
export type ArticleType = 'workflow_backed' | 'static';
export type ArticleStatus = 'draft' | 'published';

export interface Step {
  instruction: string;
  rationale?: string;
  /** R2 object key for the step's screenshot (resolved to a URL at render time). */
  screenshotKey?: string;
  selector?: string;
  route?: string;
  expectedOutcome?: string;
  uncertain?: boolean;
}

export interface Article {
  title: string;
  intent?: string;
  tags: string[];
  routes: string[];
  preconditions: string[];
  source: ArticleSource;
  type: ArticleType;
  status: ArticleStatus;
  steps: Step[];
}
