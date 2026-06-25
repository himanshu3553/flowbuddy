// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
// The structured content model (PRD §6.2). Stored in Postgres; this is the
// in-memory/transport shape used by synthesis, Studio, and the portal.

import type { Highlight } from './highlight.js';

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
  /** Element-highlight rectangle over the screenshot, as viewport fractions (0..1). */
  highlight?: Highlight;
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
