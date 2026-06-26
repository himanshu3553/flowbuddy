import OpenAI from 'openai';

/**
 * P1-M6 — the copilot answer engine: conversational, grounded ANSWER-or-DECLINE over a set of
 * knowledge items (which the caller has already restricted to APPROVED-KB — P1-M5). Mirrors the
 * retrieve→ground→decline shape of prompt.ts, but emits a chat answer + citations, not an article.
 */

/** A KB item the copilot may ground on. `id` is the KnowledgeItem id (used for citations). */
export interface CopilotKBItem {
  id: string;
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
  sourceId: string;
  segmentIndex: number | null;
  segmentTitle: string | null;
}

export type CopilotAnswer =
  | { covered: true; answer: string; citations: CopilotCitation[] }
  | { covered: false; reason: string };

const SYSTEM = `You are an in-app support copilot embedded inside a SaaS product.
Answer the user's question using ONLY the provided KNOWLEDGE ITEMS — they were captured from THIS product's own recordings and human-approved for you to use.

Strict rules:
- Use ONLY the knowledge items. NEVER use general knowledge, and NEVER invent UI, steps, features, or facts.
- If the items genuinely cover the question, write a concise, friendly answer — step-by-step when the user is asking how to do something. Set "covered" to true.
- If the items do NOT cover the question, set "covered" to false and give a one-sentence reason. Do NOT guess or partially answer from outside the items.
- In "citedItemIds", list the ids of the knowledge items you actually used (empty if you declined).
- Privacy: items are pre-redacted — placeholders like [redacted-email], [redacted-phone], [redacted-card], [redacted-ssn] mark removed personal data. Treat them as opaque, never reproduce them, and never emit personal data; refer to such values generically (e.g. "your email"). This rule ONLY governs how you phrase things — it does NOT change whether a question is "covered". Answer normally in every other respect.`;

const schema = {
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
    },
    required: ['covered', 'reason', 'answer', 'citedItemIds'],
  },
} as const;

export async function answerFromKB(input: {
  question: string;
  history?: CopilotTurn[];
  items: CopilotKBItem[];
  context?: { path?: string | null }; // P1-M8: where the end-user is in the host app
  apiKey: string;
  model: string;
}): Promise<CopilotAnswer> {
  if (input.items.length === 0) {
    return { covered: false, reason: "I don't have anything in our help content that covers that yet." };
  }
  const openai = new OpenAI({ apiKey: input.apiKey });
  const byId = new Map(input.items.map((i) => [i.id, i]));

  const itemBlock = input.items
    .map((i) => {
      const wf = i.segmentTitle ? ` [workflow: ${i.segmentTitle}]` : '';
      const narr = i.narration ? `\n   narration: "${i.narration}"` : '';
      return `- id=${i.id}${wf}: ${i.text}${narr}`;
    })
    .join('\n');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM }];
  for (const t of input.history ?? []) {
    if (t.role === 'user' || t.role === 'assistant') messages.push({ role: t.role, content: t.content });
  }
  const ctxLine = input.context?.path
    ? `The user is currently on the page "${input.context.path}". Prefer steps relevant to that screen when applicable (but still answer the actual question).\n\n`
    : '';
  messages.push({
    role: 'user',
    content: `${ctxLine}KNOWLEDGE ITEMS (the only thing you may use):\n${itemBlock}\n\nQuestion: ${input.question}`,
  });

  const res = await openai.chat.completions.create({
    model: input.model,
    messages,
    response_format: { type: 'json_schema', json_schema: schema as never },
  });

  let a: { covered?: boolean; reason?: string; answer?: string; citedItemIds?: string[] };
  try {
    a = JSON.parse(res.choices[0]?.message?.content ?? '{}');
  } catch {
    return { covered: false, reason: "I couldn't find an answer in our help content." };
  }

  if (!a.covered || !a.answer) {
    return { covered: false, reason: a.reason || "I don't have anything that covers that yet." };
  }

  const citations: CopilotCitation[] = [];
  const seen = new Set<string>();
  for (const id of a.citedItemIds ?? []) {
    const it = byId.get(id);
    if (it && !seen.has(id)) {
      seen.add(id);
      citations.push({ itemId: it.id, sourceId: it.sourceId, segmentIndex: it.segmentIndex, segmentTitle: it.segmentTitle });
    }
  }
  return { covered: true, answer: a.answer, citations };
}
