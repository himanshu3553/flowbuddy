import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { formatItems, runAnswerLoop, shapeAnswer, type EngineTool } from './engine';
import type { CopilotKBItem, SenseHypothesisContext } from './copilot';

/**
 * The engine's contract, pinned (2026-07-26).
 *
 * The first block is the one that matters most: it is the executable form of the promise that
 * **AI Chatbot behaves exactly as it did before the modes existed** — one model call, and no tool
 * surface offered to the model at all. That promise is otherwise invisible, provable only by
 * reading two files side by side, and quietly breakable by anyone adding a tool later.
 */

/** A scripted tool call. A bare string is the argument-less form (what the diagnostic path's tools
 *  look like); the object form is what a PARAMETERIZED tool looks like — and until it existed the
 *  harness could only script `arguments: '{}'`, so "the same tool called with different arguments"
 *  was inexpressible and the de-dup defect could not be written down as a test. */
type StubToolCall = string | { name: string; arguments: string };

interface StubReply {
  content?: string;
  toolCalls?: StubToolCall[];
  /** Scripts a response the model could not finish — the reasoning-budget failure mode. */
  incomplete?: 'max_output_tokens' | 'content_filter';
  /** Scripts a TERMINAL provider failure delivered in the body (200 + status:'failed'). */
  failed?: { code?: string; message?: string };
  /** What this round consumed. `cached` ⊆ `input` and `reasoning` ⊆ `output`, as the provider
   *  reports them — the harness reproduces that nesting so a test cannot accidentally prove the
   *  loop right about a shape the API does not actually send. */
  usage?: { input: number; cached?: number; output: number; reasoning?: number };
}

/** A fake OpenAI whose `responses.create` returns scripted replies and records every request.
 *  Mirrors the Responses wire shape: an `output` array of items, plus the `output_text` convenience
 *  the loop reads. A scripted reasoning item is included on tool rounds so the echo-back behaviour
 *  (which is the whole point of this endpoint) is observable. */
function stubOpenAI(replies: StubReply[]) {
  const requests: Array<Record<string, any>> = [];
  let i = 0;
  const openai = {
    responses: {
      create: async (req: Record<string, any>) => {
        requests.push(req);
        const r = replies[Math.min(i, replies.length - 1)] ?? {};
        i += 1;
        const output: any[] = [];
        if (r.toolCalls) {
          // A reasoning model emits its reasoning item alongside the calls.
          output.push({ type: 'reasoning', id: `rs-${i}`, summary: [] });
          for (const [n, c] of r.toolCalls.entries()) {
            const { name, args } = typeof c === 'string' ? { name: c, args: '{}' } : { name: c.name, args: c.arguments };
            output.push({ type: 'function_call', id: `fc-${i}-${n}`, call_id: `call-${i}-${n}`, name, arguments: args });
          }
        }
        if (r.content !== undefined) {
          output.push({
            type: 'message',
            id: `msg-${i}`,
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: r.content, annotations: [] }],
          });
        }
        return {
          output,
          output_text: r.content ?? '',
          ...(r.usage
            ? {
                usage: {
                  input_tokens: r.usage.input,
                  input_tokens_details: { cached_tokens: r.usage.cached ?? 0 },
                  output_tokens: r.usage.output,
                  output_tokens_details: { reasoning_tokens: r.usage.reasoning ?? 0 },
                  total_tokens: r.usage.input + r.usage.output,
                },
              }
            : {}),
          ...(r.failed
            ? { status: 'failed', error: r.failed }
            : r.incomplete
              ? { status: 'incomplete', incomplete_details: { reason: r.incomplete } }
              : { status: 'completed' }),
        };
      },
    },
  };
  return { openai: openai as unknown as OpenAI, requests };
}

/** `onRun` receives the RAW arguments the loop dispatched with — without that, a test can see how
 *  many times a tool ran but not *what it was asked*, which is the whole question here. */
function tool(name: string, reply = 'ok', onRun?: (rawArgs: string) => void): EngineTool {
  return {
    name,
    spec: {
      type: 'function',
      name,
      description: name,
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      strict: false,
    },
    run: async (rawArgs: string) => {
      onRun?.(rawArgs);
      return { reply };
    },
  };
}

/** A search call, scripted. */
const search = (query: string) => ({ name: 'search_knowledge', arguments: JSON.stringify({ query }) });

describe('runAnswerLoop — AI Chatbot (mode 1) is the loop with nothing bound', () => {
  it('makes EXACTLY ONE model call when no tools are bound', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{"covered":true,"answer":"hi"}' }]);
    await runAnswerLoop({
      openai,
      model: 'test-model',
      messages: [{ role: 'user', content: 'q' }],
      maxOutputTokens: 700,
      maxRounds: 1,
    });
    expect(requests).toHaveLength(1);
  });

  it('OMITS tools/tool_choice from the request entirely — an empty array is not the same wire call', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]).not.toHaveProperty('tools');
    expect(requests[0]).not.toHaveProperty('tool_choice');
  });

  it('passes the caller\'s output cap through unchanged', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]?.max_output_tokens).toBe(700);
  });

  it('sends NO temperature — sampling is left to the model', async () => {
    // Reasoning models reject an explicit temperature outright. Every call in this package is on
    // /v1/responses now, so there is no longer anywhere that pins one.
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]).not.toHaveProperty('temperature');
  });

  it('omits `reasoning` entirely when the caller does not ask for an effort', async () => {
    // Unset means "whatever the model does by default" — the loop must not silently pick a level
    // and quietly change cost or depth for every workspace.
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]).not.toHaveProperty('reasoning');
  });

  it('passes a requested reasoning effort through', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1, reasoningEffort: 'high' });
    expect(requests[0]?.reasoning).toEqual({ effort: 'high' });
  });

  it('asks for structured output via text.format, not response_format', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]).not.toHaveProperty('response_format');
    expect(requests[0]?.text?.format?.type).toBe('json_schema');
    expect(requests[0]?.text?.format?.name).toBe('copilot_answer');
    expect(requests[0]?.text?.format?.schema).toBeTruthy();
  });

  it('reports truncation as `incomplete` rather than letting it look like a decline', async () => {
    // On a reasoning model max_output_tokens covers thinking, so running out returns empty text —
    // which shapeAnswer parses as a normal decline and analytics files as a coverage gap the
    // founder can never fix by recording anything. The loop must say it was OUR budget.
    const { openai } = stubOpenAI([{ content: '', incomplete: 'max_output_tokens' }]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 10, maxRounds: 1 });
    expect(r.incomplete).toBe('max_output_tokens');
  });

  it('reports a body-level provider failure instead of returning an empty answer', async () => {
    // /v1/responses can answer HTTP 200 with {status:'failed'}, which the SDK does NOT throw on.
    // Unhandled, that reaches shapeAnswer as empty text and becomes a coverage gap against a
    // workflow the founder did record — the callers' safety floors never fire because nothing
    // threw. Surfaced as data (not thrown) because mode 1 has no floor beneath it.
    const { openai } = stubOpenAI([{ content: '', failed: { code: 'server_error', message: 'boom' } }]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(r.failed).toEqual({ code: 'server_error', message: 'boom' });
  });

  it('stops immediately on a failed response rather than spending another round', async () => {
    const { openai, requests } = stubOpenAI([
      { failed: { code: 'server_error' } },
      { content: '{"covered":true,"answer":"never reached"}' },
    ]);
    await runAnswerLoop({
      openai, model: 'm', messages: [], tools: [tool('peek')], maxOutputTokens: 900, maxRounds: 4,
    });
    expect(requests).toHaveLength(1);
  });

  it('never calls a bound tool when maxRounds is 1 — the forced stop wins', async () => {
    // Belt and braces: even if a caller binds tools AND caps rounds at 1, the single round is the
    // final round, so tool_choice is 'none' and the model is not invited to reach for anything.
    let ran = false;
    const { openai, requests } = stubOpenAI([{ toolCalls: ['t'] }]);
    await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('t', 'ok', () => { ran = true; })],
      maxOutputTokens: 700,
      maxRounds: 1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.tool_choice).toBe('none');
    expect(ran).toBe(false);
  });
});

describe('runAnswerLoop — with tools bound (Copilot mode / the diagnostic path)', () => {
  it('echoes the model output — INCLUDING reasoning items — back on the next round', async () => {
    // The whole reason this path is /v1/responses. A reasoning model hands back `reasoning` items
    // alongside its tool calls; if the next request does not carry them, the model restarts its
    // thinking from scratch every tool round. That does not error — it just reasons worse, silently,
    // which is exactly the kind of regression nobody notices. So it is pinned here.
    const { openai, requests } = stubOpenAI([
      { toolCalls: ['peek'] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('peek')],
      maxOutputTokens: 900,
      maxRounds: 2,
    });
    const secondInput = requests[1]?.input as any[];
    expect(secondInput.some((it) => it.type === 'reasoning')).toBe(true);
    expect(secondInput.some((it) => it.type === 'function_call')).toBe(true);
    const out = secondInput.find((it) => it.type === 'function_call_output');
    expect(out).toBeTruthy();
    // Paired by call_id, not the item id — mixing these up leaves the call unanswered.
    const call = secondInput.find((it) => it.type === 'function_call');
    expect(out.call_id).toBe(call.call_id);
  });

  it('still carries tools on the FINAL round, with tool_choice none', async () => {
    const { openai, requests } = stubOpenAI([
      { toolCalls: ['peek'] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    await runAnswerLoop({
      openai, model: 'm', messages: [], tools: [tool('peek')], maxOutputTokens: 900, maxRounds: 2,
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tool_choice).toBe('auto');
    expect(requests[1]?.tool_choice).toBe('none');
    expect(requests[1]).toHaveProperty('tools');
  });

  it('serves a requested tool and comes back for another round', async () => {
    let ran = 0;
    const { openai, requests } = stubOpenAI([
      { toolCalls: ['peek'] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    const { content } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('peek', 'here you go', () => { ran += 1; })],
      maxOutputTokens: 900,
    });
    expect(ran).toBe(1);
    expect(requests).toHaveLength(2);
    expect(content).toBe('{"covered":true,"answer":"done"}');
  });

  it('refuses to serve the IDENTICAL call twice — repeat requests cost the workspace money for nothing', async () => {
    let ran = 0;
    const { openai } = stubOpenAI([
      { toolCalls: ['peek'] },
      { toolCalls: ['peek'] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('peek', 'here you go', () => { ran += 1; })],
      maxOutputTokens: 900,
    });
    expect(ran).toBe(1);
  });

  it('argument-less tools keep the once-per-tool behaviour the diagnostic path relies on', async () => {
    // reason.ts binds three tools that all take NO_ARGS, so widening the de-dup key to the
    // arguments must collapse to exactly what it did before for them: `name:{}` twice is a repeat.
    let ran = 0;
    const { openai } = stubOpenAI([
      { toolCalls: ['get_page_image'] },
      { toolCalls: [{ name: 'get_page_image', arguments: '{}' }] },
      { content: '{}' },
    ]);
    await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('get_page_image', 'pixels', () => { ran += 1; })],
      maxOutputTokens: 900,
    });
    expect(ran).toBe(1);
  });
});

describe('runAnswerLoop — a parameterized tool is a DIFFERENT request per argument', () => {
  // The bug this pins: the loop used to remember tool NAMES, so a second search with different
  // wording was refused as a repeat — while the agent's own prompt was telling it to "re-search
  // with different words rather than declining on the first miss". It was instructed to try again
  // and then structurally prevented from trying again, leaving "decline honestly" as the only move.

  it('runs the SAME tool again when the arguments differ', async () => {
    const asked: string[] = [];
    const { openai } = stubOpenAI([
      { toolCalls: [search('create a project')] },
      { toolCalls: [search('new project setup')] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    const { toolCalls } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge', 'results', (raw) => { asked.push(raw); })],
      maxOutputTokens: 900,
    });
    expect(asked).toEqual([
      JSON.stringify({ query: 'create a project' }),
      JSON.stringify({ query: 'new project setup' }),
    ]);
    expect(toolCalls.every((t) => t.skipped === undefined)).toBe(true);
  });

  it('still refuses a repeat that differs only in key order or whitespace', async () => {
    let ran = 0;
    const { openai } = stubOpenAI([
      { toolCalls: [{ name: 'search_knowledge', arguments: '{"query":"create a project","scope":"all"}' }] },
      { toolCalls: [{ name: 'search_knowledge', arguments: '{"scope":"all",  "query":"create  a project "}' }] },
      { content: '{}' },
    ]);
    const { toolCalls } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge', 'results', () => { ran += 1; })],
      maxOutputTokens: 900,
    });
    expect(ran).toBe(1);
    expect(toolCalls[1]?.skipped).toBe('duplicate');
  });

  it('a mistyped tool name does not burn the slot of the tool that exists', async () => {
    // The name-keyed version marked EVERY requested name as served, including unknown ones, so a
    // single typo could cost the model a tool it had not used yet.
    let ran = 0;
    const { openai } = stubOpenAI([
      { toolCalls: ['search_knowlege'] }, // typo
      { toolCalls: [search('create a project')] },
      { content: '{}' },
    ]);
    const { toolCalls } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge', 'results', () => { ran += 1; })],
      maxOutputTokens: 900,
    });
    expect(toolCalls[0]?.skipped).toBe('unknown');
    expect(ran).toBe(1);
  });

  it('caps EXECUTIONS at maxToolCalls even when one round asks for many', async () => {
    // The old name-keyed de-dup capped executions at "one per tool, ever" by accident. Widening the
    // key removes that accidental ceiling, so the real budget has to hold WITHIN a round too —
    // otherwise a single reply asking for ten searches means ten retrievals on a public endpoint.
    let ran = 0;
    const { openai } = stubOpenAI([
      { toolCalls: [search('a'), search('b'), search('c'), search('d'), search('e')] },
      { content: '{}' },
    ]);
    const { toolCalls } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge', 'results', () => { ran += 1; })],
      maxOutputTokens: 900,
      maxToolCalls: 3,
    });
    expect(ran).toBe(3);
    expect(toolCalls.filter((t) => t.skipped === 'budget')).toHaveLength(2);
  });

  it('reports what the loop did — rounds and every call, including the ones that never ran', async () => {
    // Without this the two failure modes ("answered the wrong question" vs "wanted to keep looking
    // and was refused") arrive at the founder as the same silent decline.
    const { openai } = stubOpenAI([
      { toolCalls: [search('create a project')] },
      { toolCalls: [search('create a project')] },
      { content: '{}' },
    ]);
    const { rounds, toolCalls } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge')],
      maxOutputTokens: 900,
    });
    expect(rounds).toBe(3);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toMatchObject({ name: 'search_knowledge', round: 0 });
    expect(toolCalls[0]?.skipped).toBeUndefined(); // it ran
    expect(toolCalls[1]).toMatchObject({ name: 'search_knowledge', round: 1, skipped: 'duplicate' });
  });

  it('a tool the caller did not bind simply does not exist', async () => {
    // Absence, not refusal: an unbound capability is answered as unknown rather than as forbidden,
    // so the model can never report a workspace's configuration back to an end-user.
    const { openai } = stubOpenAI([{ toolCalls: ['act_on_page'] }, { content: '{}' }]);
    const { content } = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('peek')],
      maxOutputTokens: 900,
    });
    expect(content).toBe('{}'); // survived, no throw
  });

  it('stops after the round cap even if the model keeps asking for tools', async () => {
    const { openai, requests } = stubOpenAI([{ toolCalls: ['peek'] }]); // always asks
    await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('peek')],
      maxOutputTokens: 900,
      maxRounds: 3,
    });
    expect(requests).toHaveLength(3);
  });
});

describe('formatItems — what the agent can aim a tool at', () => {
  const item = (over: Partial<CopilotKBItem> = {}): CopilotKBItem => ({
    id: 'itm1',
    workflowId: 'wf9',
    sourceId: 'src9',
    segmentIndex: 2,
    segmentTitle: 'Create a project',
    text: 'Click New Project',
    ...over,
  });

  it('shows the workflow KEY on every item, so get_workflow can reach off-screen workflows', () => {
    // Without this the only `key=` in the whole prompt comes from POSITION CONTEXT — i.e. the
    // workflow the user is already standing in — so "how do I do <thing on another screen>?" had
    // fragments visible and no way to ask for the rest.
    expect(formatItems([item()])).toBe('- id=itm1 [workflow: Create a project · key=src9:2]: Click New Project');
  });

  it('omits the key when the item belongs to no workflow — never an unresolvable key', () => {
    expect(formatItems([item({ segmentIndex: null })])).toBe('- id=itm1 [workflow: Create a project]: Click New Project');
  });

  it('emits the key even when the workflow has no title', () => {
    expect(formatItems([item({ segmentTitle: null })])).toBe('- id=itm1 [key=src9:2]: Click New Project');
  });

  it('keeps segment 0 — a falsy index is a real workflow, not a missing one', () => {
    expect(formatItems([item({ segmentIndex: 0 })])).toContain('key=src9:0');
  });

  it('still carries narration, and says so plainly when there is nothing to show', () => {
    expect(formatItems([item({ narration: 'say hi' })])).toContain('\n   narration: "say hi"');
    expect(formatItems([])).toBe('- (none)');
  });

  it('P3-M2 (EC-10) — states the workflow’s contract facts where the plan lives, and only when they exist', () => {
    const withFacts = formatItems([
      item({ workflowFacts: { entry: '/settings/team', finish: ['Invitation sent'] } }),
    ]);
    expect(withFacts).toContain('WORKFLOW: Create a project');
    expect(withFacts).toContain('\n  starts on: /settings/team');
    expect(withFacts).toContain('\n  when done, the user sees: "Invitation sent"');
    // Facts without a plan still get the header; neither → byte-identical to the pre-facts output.
    expect(formatItems([item()])).toBe('- id=itm1 [workflow: Create a project · key=src9:2]: Click New Project');
    const entryOnly = formatItems([item({ workflowFacts: { entry: '/settings/team' } })]);
    expect(entryOnly).toContain('starts on: /settings/team');
    expect(entryOnly).not.toContain('when done');
  });
});

describe('shapeAnswer', () => {
  const items: CopilotKBItem[] = [
    { id: 'a', workflowId: 'wf-a', sourceId: 'src', segmentIndex: 0, segmentTitle: 'Create an account', text: 'step' },
  ];
  const hyps: SenseHypothesisContext[] = [
    { sourceId: 'src', segmentIndex: 0, title: 'Create an account', step: 2, totalSteps: 6, confidence: 0.9, stepsDone: [1] },
  ];

  it('cites only items we actually supplied', async () => {
    // The model naming an id we never sent must produce NO citation — never a citation pointing at
    // something outside the approved set we chose to ground on.
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: ['a', 'ghost'] }),
      items,
      declineReason: 'no',
    });
    expect(r.covered).toBe(true);
    if (r.covered) expect(r.citations.map((c) => c.itemId)).toEqual(['a']);
  });

  it('takes the step from the PROBE, not from the model', async () => {
    // The model tends to echo the step it is telling the user to do NEXT; trusting it would
    // mis-key the on-page highlight.
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: [], usedPosition: true, positionKey: 'src:0', positionStep: 5 }),
      items,
      hypotheses: hyps,
      declineReason: 'no',
    });
    expect(r.covered).toBe(true);
    if (r.covered) expect(r.position?.step).toBe(2);
  });

  it('ignores a position key naming a hypothesis we never provided', async () => {
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: [], usedPosition: true, positionKey: 'someone-else:9' }),
      items,
      hypotheses: hyps,
      declineReason: 'no',
    });
    // Falls back to the first hypothesis WE supplied rather than inventing the model's key.
    if (r.covered) expect(r.position).toEqual({ sourceId: 'src', segmentIndex: 0, step: 2 });
  });

  it('declines with the caller\'s wording, and uses the separate parse-failure wording', async () => {
    const bad = shapeAnswer({ content: 'not json', items, declineReason: 'D', parseFailReason: 'P' });
    expect(bad).toEqual({ covered: false, reason: 'P' });

    const uncovered = shapeAnswer({
      content: JSON.stringify({ covered: false }),
      items,
      declineReason: 'D',
      parseFailReason: 'P',
    });
    expect(uncovered).toEqual({ covered: false, reason: 'D' });
  });

  it('prefers the model\'s own decline wording when it gave one', async () => {
    const r = shapeAnswer({
      content: JSON.stringify({ covered: false, reason: 'I have not been taught that yet.' }),
      items,
      declineReason: 'fallback',
    });
    expect(r).toEqual({ covered: false, reason: 'I have not been taught that yet.' });
  });
});

/**
 * What a question COST (2026-08-03).
 *
 * These exist because the failure mode is silent and one-directional: every plausible mistake here
 * UNDER-reports, and it under-reports exactly the expensive questions — the ones that searched
 * twice, or failed and were caught by the floor. A cost number that is quietly low is worse than no
 * cost number, because it will be used to price a tier.
 */
describe('token usage', () => {
  const answer = JSON.stringify({ covered: true, answer: 'a', citedItemIds: [] });

  it('sums every round rather than reporting the last one', async () => {
    // THE test. A loop that searched twice before answering paid for all three calls; anything that
    // overwrites per round would report the final, cheapest one.
    const { openai } = stubOpenAI([
      { toolCalls: ['search_knowledge'], usage: { input: 100, output: 20 } },
      { toolCalls: [{ name: 'search_knowledge', arguments: '{"query":"other"}' }], usage: { input: 200, output: 30 } },
      { content: answer, usage: { input: 300, output: 50 } },
    ]);
    const r = await runAnswerLoop({
      openai,
      model: 'm',
      messages: [],
      tools: [tool('search_knowledge')],
      maxOutputTokens: 100,
    });
    expect(r.rounds).toBe(3);
    expect(r.usage.input).toBe(600);
    expect(r.usage.output).toBe(100);
  });

  it('keeps the cached and reasoning subsets separate from their totals', async () => {
    // Both are SUBSETS the provider nests inside the number above them. Adding either to its parent
    // would double-count; dropping the cache would overstate spend on these long, stable prompts.
    const { openai } = stubOpenAI([
      { content: answer, usage: { input: 1000, cached: 800, output: 200, reasoning: 150 } },
    ]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 100 });
    expect(r.usage).toEqual({ input: 1000, cachedInput: 800, output: 200, reasoning: 150 });
  });

  it('bills a round the provider could not finish', async () => {
    // An `incomplete` response was paid for — the budget was spent on reasoning, which is precisely
    // the case worth being able to see in the cost data.
    const { openai } = stubOpenAI([
      { content: '', incomplete: 'max_output_tokens', usage: { input: 500, output: 4000, reasoning: 4000 } },
    ]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 4000 });
    expect(r.incomplete).toBe('max_output_tokens');
    expect(r.usage.output).toBe(4000);
    expect(r.usage.reasoning).toBe(4000);
  });

  it('bills a round that came back as a terminal failure', async () => {
    // A `failed` body still consumed the prompt. The loop breaks out of the round — the count must
    // not break with it, or every provider incident reads as free.
    const { openai } = stubOpenAI([{ failed: { code: 'server_error' }, usage: { input: 700, output: 0 } }]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 100 });
    expect(r.failed?.code).toBe('server_error');
    expect(r.usage.input).toBe(700);
  });

  it('reports zeros, never nulls, when the provider sent no usage at all', async () => {
    // The caller decides whether zeros mean "free" or "unknown" (the API writes null on all-zero).
    // The loop's own contract stays a plain object so nothing downstream needs a null check.
    const { openai } = stubOpenAI([{ content: answer }]);
    const r = await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 100 });
    expect(r.usage).toEqual({ input: 0, cachedInput: 0, output: 0, reasoning: 0 });
  });
});
