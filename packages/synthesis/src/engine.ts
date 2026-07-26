import OpenAI from 'openai';
import type { AnswerPosition, CopilotAnswer, CopilotCitation, CopilotKBItem, SenseHypothesisContext } from './copilot';

/**
 * The shared answering engine — ONE loop, ONE answer shape, several configurations.
 *
 * WHY THIS EXISTS (2026-07-26, ahead of mode 2 — docs/unified-agent.md). The two answer paths were
 * always the same machine wearing different hats: the diagnostic path runs a tool loop, and the
 * fast path is that identical loop with **no tools bound** — with zero tools the loop makes exactly
 * one model call and breaks. Extracting it makes that literal, which is what lets `AI Chatbot`
 * stop being a second pipeline standing beside the agent and become *the agent with nothing bound
 * and a forced stop after step one*.
 *
 * The payoff is the user's own requirement: collapsing AI Chatbot into Copilot later is raising a
 * cap and binding tools, never a rewrite. And adding a tool is adding an object to an array — the
 * loop itself never changes shape again.
 *
 * The invariant that survives every configuration: **the model chooses which grounded primitive to
 * invoke; it never chooses what to do on the page.** Tools are supplied by the caller, so the
 * engine can only ever offer what the caller decided the workspace is permitted to use. Absence,
 * not refusal — a tool that isn't bound doesn't exist as far as the model is concerned.
 */

/** The one answer shape every path returns. Identical in both engines before the extraction. */
export const ANSWER_SCHEMA = {
  name: 'copilot_answer',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      covered: { type: 'boolean' },
      reason: { type: 'string' },
      answer: { type: 'string' },
      citedItemIds: { type: 'array', items: { type: 'string' } },
      // P2 Sense — whether the answer used the position context, and which hypothesis/step it
      // addressed ("" / 0 when unused). Drives senseUsed logging (P2-M4) + the show-me highlight.
      usedPosition: { type: 'boolean' },
      positionKey: { type: 'string' },
      positionStep: { type: 'number' },
    },
    required: ['covered', 'reason', 'answer', 'citedItemIds', 'usedPosition', 'positionKey', 'positionStep'],
  },
} as const;

/** Render knowledge items for a prompt. One shape everywhere, so an item the model met in the
 *  opening context and the same item returned later by a tool look identical and read as one thing. */
export function formatItems(items: CopilotKBItem[]): string {
  if (items.length === 0) return '- (none)';
  return items
    .map((i) => {
      const wf = i.segmentTitle ? ` [workflow: ${i.segmentTitle}]` : '';
      const narr = i.narration ? `\n   narration: "${i.narration}"` : '';
      return `- id=${i.id}${wf}: ${i.text}${narr}`;
    })
    .join('\n');
}

/** The raw JSON the model returns against ANSWER_SCHEMA. */
interface AnswerDraft {
  covered?: boolean;
  reason?: string;
  answer?: string;
  citedItemIds?: string[];
  usedPosition?: boolean;
  positionKey?: string;
  positionStep?: number;
  // Copilot mode only — absent from mode 1's schema, so always undefined there.
  highlight?: boolean;
  offerWalkthrough?: boolean;
}

/** Images cannot ride a `tool` message (string-only), so a tool returns a text reply and any
 *  pixels follow in ONE user message after all the results in that round. */
export interface ToolResult {
  reply: string;
  images?: OpenAI.Chat.ChatCompletionContentPart[];
}

/** A grounded primitive the model may invoke. Bundling the spec with its runner is what keeps
 *  "what the model may do" a property of the CALLER, never of the loop. */
export interface EngineTool {
  name: string;
  spec: OpenAI.Chat.ChatCompletionTool;
  run: (rawArgs: string) => Promise<ToolResult>;
}

// Defaults inherited from the diagnostic path, where they were user-verified in production.
const DEFAULT_MAX_ROUNDS = 4; // up to 3 tool rounds, then the final answer is forced
const DEFAULT_MAX_TOOL_CALLS = 4; // across the whole loop — each is money on a public endpoint

export interface AnswerLoopOpts {
  openai: OpenAI;
  model: string;
  /** Mutated in place as the conversation grows — callers pass a fresh array. */
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Empty (the default) = the single-shot path: exactly one model call, no tool surface at all. */
  tools?: EngineTool[];
  maxOutputTokens: number;
  /** Hard ceiling on model calls. **1 = AI Chatbot** — the loop, forced to stop after step one. */
  maxRounds?: number;
  maxToolCalls?: number;
  /** Response schema. Defaults to ANSWER_SCHEMA; Copilot mode passes a SUPERSET so it can also
   *  declare on-page intents. Mode 1's schema is never widened — its wire shape is frozen. */
  schema?: unknown;
}

/**
 * Run the answer loop and return the model's final JSON text (or null if it never produced one).
 *
 * With no tools this is byte-for-byte the old fast path: `finalRound` is true immediately, the
 * `tools`/`tool_choice` keys are omitted from the request entirely (not sent as empty), one call
 * is made, and the loop breaks on the first response.
 */
export async function runAnswerLoop(opts: AnswerLoopOpts): Promise<string | null> {
  const tools = opts.tools ?? [];
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxToolCalls = opts.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const { messages } = opts;
  const served = new Set<string>();
  let toolCalls = 0;
  let content: string | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const finalRound = round === maxRounds - 1 || toolCalls >= maxToolCalls || tools.length === 0;
    const res = await opts.openai.chat.completions.create({
      model: opts.model,
      messages,
      ...(tools.length > 0
        ? {
            tools: tools.map((t) => t.spec),
            tool_choice: finalRound ? ('none' as const) : ('auto' as const),
          }
        : {}),
      response_format: { type: 'json_schema', json_schema: (opts.schema ?? ANSWER_SCHEMA) as never },
      // Cost ceiling: the answer endpoint is public (rate-limited but key-in-page-source), so cap
      // output tokens — a truncated JSON parses as a decline, which is the graceful failure mode.
      // Low temperature for consistent answers (segment/distill pin 0; a touch of warmth is fine).
      max_completion_tokens: opts.maxOutputTokens,
      temperature: 0.2,
    });

    const msg = res.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      content = msg.content ?? null;
      break;
    }
    // A FINAL round never serves tools. `tool_choice: 'none'` already asks the model not to call
    // any, but a model that does anyway must not be obeyed: there is no round left to use the
    // result, so the call would be pure cost — and in an acting mode, an action taken after the
    // loop has decided to stop, which nobody observes or verifies. Structural, not advisory.
    if (finalRound) {
      content = msg.content ?? null;
      break;
    }

    messages.push(msg);
    const imageParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const tc of msg.tool_calls) {
      toolCalls++;
      const name = tc.type === 'function' ? tc.function.name : '';
      let reply: string;
      if (served.has(name)) {
        // Each tool answers once per conversation — a model that re-requests evidence it already
        // has is burning the workspace owner's money for nothing.
        reply = 'Already provided earlier in this conversation — do not request it again.';
      } else {
        const tool = byName.get(name);
        if (!tool) {
          reply = 'Unknown tool.';
        } else {
          const result = await tool.run(tc.type === 'function' ? tc.function.arguments : '');
          reply = result.reply;
          if (result.images?.length) imageParts.push(...result.images);
        }
      }
      served.add(name);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: reply });
    }
    if (imageParts.length > 0) messages.push({ role: 'user', content: imageParts });
  }

  return content;
}

/**
 * Turn the model's raw JSON into the answer every caller (widget, logging, analytics) consumes.
 *
 * Two rules worth not losing:
 * - **Citations are resolved against the items WE supplied** — the model naming an id we never
 *   sent produces no citation, rather than a citation to something unapproved.
 * - **The position key must name a hypothesis WE provided**, and the step returned is the PROBE's
 *   step (where the user actually stands), never the model's echoed step — the model tends to
 *   echo the step it is telling the user to do NEXT, which would mis-key the show-me highlight.
 */
export function shapeAnswer(opts: {
  content: string | null;
  items: CopilotKBItem[];
  hypotheses?: SenseHypothesisContext[];
  /** Shown when the model reports no coverage and offers no reason of its own. */
  declineReason: string;
  /** Shown when the JSON won't parse (truncated output). Defaults to `declineReason` — the two
   *  paths word these differently, and the wording is user-facing, so it stays a caller decision. */
  parseFailReason?: string;
}): CopilotAnswer {
  let a: AnswerDraft;
  try {
    a = JSON.parse(opts.content ?? '{}');
  } catch {
    return { covered: false, reason: opts.parseFailReason ?? opts.declineReason };
  }
  if (!a.covered || !a.answer) {
    return { covered: false, reason: a.reason || opts.declineReason };
  }

  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const citations: CopilotCitation[] = [];
  const seen = new Set<string>();
  for (const id of a.citedItemIds ?? []) {
    const it = byId.get(id);
    if (it && !seen.has(id)) {
      seen.add(id);
      citations.push({
        itemId: it.id,
        sourceId: it.sourceId,
        segmentIndex: it.segmentIndex,
        segmentTitle: it.segmentTitle,
      });
    }
  }

  let position: AnswerPosition | null = null;
  const hyps = opts.hypotheses ?? [];
  if (a.usedPosition && hyps.length > 0) {
    const match = hyps.find((h) => `${h.sourceId}:${h.segmentIndex}` === (a.positionKey ?? '')) ?? hyps[0]!;
    position = { sourceId: match.sourceId, segmentIndex: match.segmentIndex, step: match.step };
  }

  // Only surface intents the model was actually ASKED for (its schema included them). Mode 1's
  // schema has no such fields, so this stays undefined and its wire shape is untouched.
  const intents =
    a.highlight !== undefined || a.offerWalkthrough !== undefined
      ? { highlight: a.highlight === true, offerWalkthrough: a.offerWalkthrough === true }
      : undefined;

  return { covered: true, answer: a.answer, citations, position, ...(intents ? { intents } : {}) };
}
