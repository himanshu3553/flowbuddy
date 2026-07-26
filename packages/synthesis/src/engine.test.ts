import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { runAnswerLoop, shapeAnswer, type EngineTool } from './engine';
import type { CopilotKBItem, SenseHypothesisContext } from './copilot';

/**
 * The engine's contract, pinned (2026-07-26).
 *
 * The first block is the one that matters most: it is the executable form of the promise that
 * **AI Chatbot behaves exactly as it did before the modes existed** — one model call, and no tool
 * surface offered to the model at all. That promise is otherwise invisible, provable only by
 * reading two files side by side, and quietly breakable by anyone adding a tool later.
 */

interface StubReply {
  content?: string;
  toolCalls?: string[];
}

/** A fake OpenAI whose `create` returns scripted replies and records every request it received. */
function stubOpenAI(replies: StubReply[]) {
  const requests: Array<Record<string, unknown>> = [];
  let i = 0;
  const openai = {
    chat: {
      completions: {
        create: async (req: Record<string, unknown>) => {
          requests.push(req);
          const r = replies[Math.min(i, replies.length - 1)] ?? {};
          i += 1;
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: r.content ?? null,
                  ...(r.toolCalls
                    ? {
                        tool_calls: r.toolCalls.map((name, n) => ({
                          id: `call-${n}`,
                          type: 'function',
                          function: { name, arguments: '{}' },
                        })),
                      }
                    : {}),
                },
              },
            ],
          };
        },
      },
    },
  };
  return { openai: openai as unknown as OpenAI, requests };
}

function tool(name: string, reply = 'ok', onRun?: () => void): EngineTool {
  return {
    name,
    spec: {
      type: 'function',
      function: { name, description: name, parameters: { type: 'object', properties: {}, additionalProperties: false } },
    },
    run: async () => {
      onRun?.();
      return { reply };
    },
  };
}

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

  it('passes the caller\'s output cap and temperature through unchanged', async () => {
    const { openai, requests } = stubOpenAI([{ content: '{}' }]);
    await runAnswerLoop({ openai, model: 'm', messages: [], maxOutputTokens: 700, maxRounds: 1 });
    expect(requests[0]?.max_completion_tokens).toBe(700);
    expect(requests[0]?.temperature).toBe(0.2);
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
  it('serves a requested tool and comes back for another round', async () => {
    let ran = 0;
    const { openai, requests } = stubOpenAI([
      { toolCalls: ['peek'] },
      { content: '{"covered":true,"answer":"done"}' },
    ]);
    const content = await runAnswerLoop({
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

  it('refuses to serve the same tool twice — repeat requests cost the workspace money for nothing', async () => {
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

  it('a tool the caller did not bind simply does not exist', async () => {
    // Absence, not refusal: an unbound capability is answered as unknown rather than as forbidden,
    // so the model can never report a workspace's configuration back to an end-user.
    const { openai } = stubOpenAI([{ toolCalls: ['act_on_page'] }, { content: '{}' }]);
    const content = await runAnswerLoop({
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

describe('shapeAnswer', () => {
  const items: CopilotKBItem[] = [
    { id: 'a', sourceId: 'src', segmentIndex: 0, segmentTitle: 'Create an account', text: 'step' },
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

  it('reports NO intents when the caller did not ask for them (mode 1 stays untouched)', async () => {
    // AI Chatbot's schema has no intent fields, so the model can never set them. If this ever
    // returns an object, mode 1 has started emitting agent behaviour and its wire shape has moved.
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: [] }),
      items,
      declineReason: 'no',
    });
    if (r.covered) expect(r.intents).toBeUndefined();
  });

  it('carries the on-page intents through when the model was asked for them', async () => {
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: [], highlight: true, offerWalkthrough: false }),
      items,
      declineReason: 'no',
    });
    if (r.covered) expect(r.intents).toEqual({ highlight: true, offerWalkthrough: false });
  });

  it('treats anything non-true as a NO — an intent must be asserted, never inferred', async () => {
    const r = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'x', citedItemIds: [], highlight: 'yes', offerWalkthrough: 1 }),
      items,
      declineReason: 'no',
    });
    if (r.covered) expect(r.intents).toEqual({ highlight: false, offerWalkthrough: false });
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
