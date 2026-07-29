import OpenAI from 'openai';
import type { AnswerPosition, CopilotAnswer, CopilotCitation, CopilotKBItem, SenseHypothesisContext } from './copilot';

/**
 * The shared answering engine — ONE loop, ONE answer shape, several configurations.
 *
 * WHY THIS EXISTS (2026-07-26, ahead of mode 2 — docs/build/agent.md). The two answer paths were
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

/**
 * Render knowledge items for a prompt.
 *
 * ONE shape across every place the AGENT meets an item — the opening shortlist, a search result,
 * a workflow dump — so the same item read twice reads as one thing rather than two. (Mode 1 and
 * the diagnostic path each keep their own inlined copy of this rendering; their prompts are frozen
 * and must not move when this one is tuned. It is deliberately not "one shape everywhere".)
 *
 * Each line carries the two identifiers the model is asked to hand back:
 *   `id=`  the item, for citations — resolved against the items WE supplied, never trusted raw.
 *   `key=` the WORKFLOW the item belongs to, which is what `get_workflow` takes.
 *
 * The key used to be absent, and that quietly amputated the tool: the only other place a `key=`
 * appears is POSITION CONTEXT, which names the workflow the user is standing IN. So the agent could
 * pull the full steps of a workflow it had already located on the current screen, and nothing else
 * — while its own tool description offered "the workflow an item belongs to". Asked how to do
 * something recorded on another screen, it could see fragments of the answer and had no way to ask
 * for the rest.
 */
export function formatItems(items: CopilotKBItem[]): string {
  if (items.length === 0) return '- (none)';
  return items
    .map((i) => {
      const tags: string[] = [];
      if (i.segmentTitle) tags.push(`workflow: ${i.segmentTitle}`);
      // Null segmentIndex = the item belongs to no workflow, so there is nothing `get_workflow`
      // could be aimed at. Emitting `key=src:null` would hand the model a key that cannot resolve.
      if (i.segmentIndex !== null) tags.push(`key=${i.sourceId}:${i.segmentIndex}`);
      const wf = tags.length > 0 ? ` [${tags.join(' · ')}]` : '';
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
  /** Attached as a follow-up user message — a tool result item is text-only on the wire. */
  images?: OpenAI.Responses.ResponseInputContent[];
}

/** A grounded primitive the model may invoke. Bundling the spec with its runner is what keeps
 *  "what the model may do" a property of the CALLER, never of the loop. */
export interface EngineTool {
  name: string;
  /** Responses-API function tool: FLAT (`{type,name,description,parameters,strict}`), not nested
   *  under `function` the way chat-completions tools were. */
  spec: OpenAI.Responses.FunctionTool;
  run: (rawArgs: string) => Promise<ToolResult>;
}

/**
 * One invocation the model asked for — the loop's own record of what it did.
 *
 * ONE structure, two consumers (which is why it replaced a bare `Set<string>`): it is the de-dup
 * KEY, and it is the caller's TELEMETRY. Before it existed the loop remembered tool NAMES only, so
 * `search_knowledge("create a project")` and `search_knowledge("new project setup")` were the same
 * request and the second was refused — while the prompt was busy telling the model to re-search
 * with different words. Correct for the diagnostic path, whose tools take no arguments at all;
 * wrong the moment a tool grew a parameter. An acting mode's `execute_step(workflowId, k, inputs)`
 * would have inherited the same defect, and there it is not a bad answer but a skipped action.
 */
export interface ToolCallRecord {
  name: string;
  /** The model's arguments in canonical form (key-sorted, whitespace-normalized) — the de-dup key. */
  args: string;
  /** 0-based model call this was requested on. */
  round: number;
  /** Set when the call was NOT dispatched. Absent = it ran. */
  skipped?: 'duplicate' | 'unknown' | 'budget';
}

/** What the loop did, alongside what it said. Returned rather than logged in here: the engine has
 *  no logger and no opinion about persistence — the caller owns both. */
export interface AnswerLoopResult {
  /** The model's final JSON text, or null if it never produced one. */
  content: string | null;
  /** Model calls actually made. */
  rounds: number;
  /** Every tool invocation the model asked for, in order — including the ones that did not run. */
  toolCalls: ToolCallRecord[];
  /**
   * Set when the model ran out of output budget rather than finishing.
   *
   * On a REASONING model `max_output_tokens` covers reasoning tokens too, so a budget that used to
   * be generous for a short answer can now be spent entirely on thinking — and the result is empty
   * text, which `shapeAnswer` parses as a perfectly ordinary decline. That is the worst shape a bug
   * can take here: indistinguishable from "the KB doesn't cover it", and therefore invisible in the
   * coverage-gap analytics a founder uses to decide what to record next. Surfaced so the caller can
   * log it as what it is.
   */
  incomplete?: 'max_output_tokens' | 'content_filter';
  /**
   * Set when the provider returned a TERMINAL FAILURE in the response body rather than as an HTTP
   * error. `/v1/responses` can answer 200 with `{status:'failed', error:{…}}`, which the SDK does
   * not throw on — so unlike every chat-completions failure, this one arrives looking like a
   * perfectly ordinary empty answer. Left as data rather than thrown: the caller decides, and the
   * mode-1 path has no safety floor beneath it (nor a Fastify error handler), so throwing here
   * would turn a graceful decline into a raw error at the widget.
   */
  failed?: { code?: string; message?: string };
}

/** Canonical form of a tool's arguments, for de-duplication ONLY — never what the tool receives.
 *  Key order and incidental whitespace are not a different request; different values are. */
function canonicalArgs(raw: string): string {
  try {
    return stableStringify(JSON.parse(raw || '{}'));
  } catch {
    // Malformed JSON is the model's problem, not a reason to treat every bad call as identical:
    // keep the raw text so two different broken calls stay two different records.
    return (raw ?? '').trim();
  }
}

function stableStringify(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v.trim().replace(/\s+/g, ' '));
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

// Defaults inherited from the diagnostic path, where they were user-verified in production.
const DEFAULT_MAX_ROUNDS = 4; // up to 3 tool rounds, then the final answer is forced
// Counts EXECUTIONS across the whole loop — each is money on a public endpoint. A duplicate, an
// unknown name, or a call past the budget costs nothing to answer, so none of them spend it; the
// round cap is what bounds a model that does nothing but repeat itself.
const DEFAULT_MAX_TOOL_CALLS = 4;

export interface AnswerLoopOpts {
  openai: OpenAI;
  model: string;
  /** Mutated in place as the conversation grows — callers pass a fresh array.
   *  Responses-API input items: `{role, content}` messages, plus the loop's own `function_call`,
   *  `function_call_output` and `reasoning` items as the conversation accumulates. */
  messages: OpenAI.Responses.ResponseInput;
  /** Empty (the default) = the single-shot path: exactly one model call, no tool surface at all. */
  tools?: EngineTool[];
  maxOutputTokens: number;
  /** Hard ceiling on model calls. **1 = AI Chatbot** — the loop, forced to stop after step one. */
  maxRounds?: number;
  maxToolCalls?: number;
  /** Response schema. Defaults to ANSWER_SCHEMA; Copilot mode passes a SUPERSET so it can also
   *  declare on-page intents. Mode 1's schema is never widened — its wire shape is frozen. */
  schema?: unknown;
  /** Reasoning effort. Omitted entirely when unset, so the model applies its own default — which
   *  is the point of the Responses API: reasoning and function tools together, which
   *  /v1/chat/completions refuses. Set it to trade depth against latency and cost. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * Run the answer loop and return what the model said, plus what it did to get there.
 *
 * With no tools this is byte-for-byte the old fast path: `finalRound` is true immediately, the
 * `tools`/`tool_choice` keys are omitted from the request entirely (not sent as empty), one call
 * is made, and the loop breaks on the first response.
 */
export async function runAnswerLoop(opts: AnswerLoopOpts): Promise<AnswerLoopResult> {
  const tools = opts.tools ?? [];
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxToolCalls = opts.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const { messages } = opts;
  const served = new Set<string>();
  const ledger: ToolCallRecord[] = [];
  let executed = 0;
  let rounds = 0;
  let content: string | null = null;
  let incomplete: AnswerLoopResult['incomplete'];
  let failed: AnswerLoopResult['failed'];

  for (let round = 0; round < maxRounds; round++) {
    const finalRound = round === maxRounds - 1 || executed >= maxToolCalls || tools.length === 0;
    const res = await opts.openai.responses.create({
      model: opts.model,
      input: messages,
      ...(tools.length > 0
        ? {
            tools: tools.map((t) => t.spec),
            tool_choice: finalRound ? ('none' as const) : ('auto' as const),
          }
        : {}),
      text: {
        format: {
          type: 'json_schema',
          ...(opts.schema ?? ANSWER_SCHEMA),
        } as OpenAI.Responses.ResponseTextConfig['format'],
      },
      // Cost ceiling: the answer endpoint is public (rate-limited but key-in-page-source), so cap
      // output — a truncated JSON parses as a decline, which is the graceful failure mode.
      // NOTE this budget is shared with reasoning tokens on a reasoning model, so it is not a pure
      // answer-length cap any more; see the header note on why it was raised alongside this change.
      max_output_tokens: opts.maxOutputTokens,
      // Reasoning AND function tools together — the whole reason this path is /v1/responses.
      ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
      store: false, // stateless: we replay the transcript ourselves, nothing is retained server-side
    });
    rounds++;
    if (res.status === 'incomplete') incomplete = res.incomplete_details?.reason ?? 'max_output_tokens';
    if (res.status === 'failed') {
      failed = { code: res.error?.code ?? undefined, message: res.error?.message ?? undefined };
      break; // nothing usable in the body; stop rather than spend another round on it
    }

    const output = res.output ?? [];
    const calls = output.filter(
      (o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call',
    );

    // No tool calls — this is the answer. `output_text` concatenates the message parts for us.
    if (calls.length === 0) {
      content = res.output_text ?? null;
      break;
    }
    // A FINAL round never serves tools. `tool_choice: 'none'` already asks the model not to call
    // any, but a model that does anyway must not be obeyed: there is no round left to use the
    // result, so the call would be pure cost — and in an acting mode, an action taken after the
    // loop has decided to stop, which nobody observes or verifies. Structural, not advisory.
    if (finalRound) {
      content = res.output_text ?? null;
      break;
    }

    // Echo the model's own output back verbatim before answering it. This carries the
    // `function_call` items the outputs must pair with — and, on a reasoning model, the `reasoning`
    // items. Dropping those would make every tool round start the model's thinking from scratch,
    // which is the failure the Responses migration exists to avoid; it would not error, it would
    // just quietly reason worse.
    messages.push(...(output as OpenAI.Responses.ResponseInputItem[]));

    const imageParts: OpenAI.Responses.ResponseInputContent[] = [];
    for (const tc of calls) {
      const name = tc.name;
      const rawArgs = tc.arguments ?? '';
      const args = canonicalArgs(rawArgs);
      const record: ToolCallRecord = { name, args, round };
      ledger.push(record);
      let reply: string;
      // The budget is checked HERE, per call, not only between rounds. One round may contain any
      // number of tool calls, so a between-rounds check alone is not a ceiling — it was only ever
      // one because the old name-keyed de-dup capped executions at "one per tool, ever". Widening
      // the key to the arguments removes that accidental cap, so the real one has to be explicit.
      if (executed >= maxToolCalls) {
        record.skipped = 'budget';
        reply = 'The tool budget for this question is used up — answer with what you already have.';
      } else if (served.has(`${name}:${args}`)) {
        // The SAME call twice is money for nothing. A different query is a different request and
        // now runs — which is what the prompt has always told the model it could do.
        record.skipped = 'duplicate';
        reply = 'You already made this exact call; its result is above. Use it, or call with different arguments.';
      } else {
        const tool = byName.get(name);
        if (!tool) {
          // Absence, not refusal — and an unbound name must NOT burn the slot: the model
          // mistyping a tool once should not cost it the tool that actually exists.
          record.skipped = 'unknown';
          reply = 'Unknown tool.';
        } else {
          const result = await tool.run(rawArgs);
          served.add(`${name}:${args}`);
          executed++;
          reply = result.reply;
          if (result.images?.length) imageParts.push(...result.images);
        }
      }
      // Paired by `call_id` — NOT the item `id`. Getting these confused pairs an output with
      // nothing, and the model is told a call it made went unanswered.
      messages.push({ type: 'function_call_output', call_id: tc.call_id, output: reply });
    }
    // Tool outputs are text-only on the wire, so anything visual rides in a following user message.
    if (imageParts.length > 0) messages.push({ role: 'user', content: imageParts });
  }

  return { content, rounds, toolCalls: ledger, ...(incomplete ? { incomplete } : {}), ...(failed ? { failed } : {}) };
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
