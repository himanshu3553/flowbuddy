/**
 * P1-M6 — the copilot answer path's SHARED VOCABULARY: the knowledge-item and answer shapes every
 * engine speaks, the formatting rules every answer obeys, and the Sense position block.
 *
 * It used to also hold an engine — **AI Chatbot (mode 1)**, one grounded call with no tools. That
 * mode was retired: it was a strictly worse Copilot carrying a SECOND prompt and a SECOND item
 * renderer, both of which had to be tuned in parallel forever (CLAUDE.md's trap: "adding to one and
 * forgetting the other leaves the safety floor answering worse than the tier above it"). Its job —
 * answering when the agent loop fails — lives on as `answerAsFloor` in agent.ts, which is the same
 * loop with nothing bound. One prompt, one renderer, and the trap has nothing left to catch.
 *
 * What stayed here is what more than one engine needs; `reason.ts` and `agent.ts` both import it.
 */

/** A KB item the copilot may ground on. `id` is the KnowledgeItem id (used for citations). */
export interface CopilotKBItem {
  id: string;
  /** P3-M1 — the workflow's durable identity; what analytics and the approval gate key on.
   *  `''` for a `topic` item (AIL slice 2) — a product page belongs to no workflow. */
  workflowId: string;
  /** `'step'` = a workflow step (default). `'topic'` = a product-knowledge page (AIL slice 2):
   *  rendered as PRODUCT BACKGROUND in every engine, excluded from the citations array (v1 — the
   *  citation consumers are all workflow-keyed). */
  kind?: 'step' | 'topic';
  /** Slice 3, `topic` items only — the page's related workflows, pre-filtered to LIVE approvals
   *  and resolved to the `key=` form `get_workflow` takes. The bridge from an orienting answer to
   *  the how-to. */
  related?: Array<{ title: string; key: string }>;
  /** P3-M1 — the workflow's PLAN in prose: what is optional, what is a choice, what must be true
   *  first. The steps cannot express any of that — a recording is a list of actions. */
  workflowDescription?: string | null;
  sourceId: string;
  segmentIndex: number | null;
  segmentTitle: string | null;
  text: string;
  narration?: string | null;
}

export interface CopilotTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotCitation {
  itemId: string;
  /** P3-M1 — logged so a workflow's citation history survives a reprocess moving it. */
  workflowId: string;
  sourceId: string;
  segmentIndex: number | null;
  segmentTitle: string | null;
}

/**
 * P2 Sense — one localization hypothesis the widget's read-only probe produced ("the user appears
 * to be at step `step` of workflow `title`"). The TITLE is server-resolved truth (the approval
 * snapshot — never the wire value); `error` is the masked on-screen error snippet and is the ONLY
 * host-page text that reaches the prompt (delimited + treat-as-data below).
 */
export interface SenseHypothesisContext {
  sourceId: string;
  segmentIndex: number;
  title: string;
  step: number; // 1-based — the user's CURRENT (not yet completed) step
  totalSteps: number;
  confidence: number; // 0..1 (deterministic client score)
  stepsDone: number[]; // 1-based indices with hard "done" evidence (filled inputs)
  /** The current step's instruction, resolved SERVER-SIDE from the KB (trusted — anchors the
   *  model on what "step k" actually is, so it can't skip past an uncompleted step). */
  instruction?: string;
  error?: string; // masked, length-capped page error near the current step
}

export interface SenseContext {
  hypotheses: SenseHypothesisContext[];
  tie: boolean; // top two are too close to call — ask instead of guessing when the question doesn't settle it
}

/** Where the answer positioned the user, when it used the Sense context (P2-M4 logging + show-me). */
export interface AnswerPosition {
  sourceId: string;
  segmentIndex: number;
  step: number;
}

/** What an engine returns. `position` is where the answer placed the user (P2-M4 logging + the
 *  show-me highlight); everything the widget does ON the page is decided by the founder's switches
 *  and this position, never by the answer asking for it (D11 — agent.md). */
export type CopilotAnswer =
  | {
      covered: true;
      answer: string;
      citations: CopilotCitation[];
      position: AnswerPosition | null;
    }
  | { covered: false; reason: string };

/**
 * Shared answer-FORMATTING rules — appended to BOTH the agent prompt (agent.ts, in its Copilot and
 * its floor configuration) and the P2-M5 Reason prompt (reason.ts), so answers look identical
 * whichever path produced them — including the floor, which a user meets mid-failure. The widget
 * renders a deliberately tiny markdown subset (index.ts mdToHtml): **bold**, \`code\`, and plain
 * line breaks — nothing else, so these rules only ask for what actually renders.
 */
export const ANSWER_FORMAT_RULES = `

Formatting (the chat window renders **bold**, \`code\`, and line breaks — NO other markdown):
- More than one action → a numbered list ("1. …"), ONE action per line, in the order the user should do them.
- Bold every UI target the user must find or act on: click **New Project**, fill in **Full Name**, the **Analytics** link.
- Keep paragraphs to 1–2 short sentences; put a blank line before a numbered list.
- Never use headings, tables, links, or nested lists — they will not render.`;

/** Render the Sense hypotheses as a delimited, keyed prompt block (the model echoes a key back).
 *  Shared with the P2-M5 Reason engine (reason.ts) so both paths describe position identically. */
export function senseBlock(sense: SenseContext | undefined): string {
  if (!sense || sense.hypotheses.length === 0) return '';
  const conf = (c: number) => (c >= 0.65 ? 'high' : c >= 0.4 ? 'medium' : 'low');
  const lines = sense.hypotheses.map((h) => {
    const what = h.instruction ? `: "${h.instruction}"` : '';
    const done =
      h.stepsDone.length > 0
        ? ` Steps already completed: ${h.stepsDone.join(', ')}.`
        : ' No steps show completion evidence yet.';
    const err = h.error ? ` The page shows an error near this step: <page-error>${h.error}</page-error>.` : '';
    return `- key=${h.sourceId}:${h.segmentIndex} — workflow "${h.title}" (${h.totalSteps} steps). The user's CURRENT step — visible on their screen and NOT yet completed — is step ${h.step}${what} (confidence: ${conf(h.confidence)}).${done}${err}`;
  });
  return `POSITION CONTEXT (measured from the user's live page just now; may be irrelevant to the question — the question wins on topic)${sense.tie ? ' [TIE — too close to call]' : ''}:\n${lines.join('\n')}\n\n`;
}
