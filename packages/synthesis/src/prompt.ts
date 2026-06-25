// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
import OpenAI from 'openai';
import type { CapturedEvent, FileRef } from '@sync/shared';
import { eventLabel } from './segment';
import { enrichStepFromEvent, type SynthArticle, type SynthStep, type RawArticleStep } from './synthesize';

/** A candidate KB step item for prompt-to-article retrieval — carries its sourceId so screenshots
 *  (which live under each recording's path) can be resolved across recordings. */
export interface PromptItem {
  sourceId: string;
  event: CapturedEvent;
  narration: string | null;
}

/** Reads a screenshot for an event, given the recording it came from (cross-recording aware). */
export type PromptArtifactReader = (sourceId: string, file: string) => Promise<Buffer | null>;

export type PromptToArticleResult =
  | { covered: true; article: SynthArticle }
  | { covered: false; reason: string };

const MAX_IMAGES = 30;

const SYSTEM = `You assemble ONE help article on a requested TOPIC, grounded ONLY in the user's captured product steps.
You are given a topic and a pool of captured steps (events + narration, some with screenshots) drawn from one or more recordings.

Strict rules:
- Use ONLY the provided steps. NEVER invent UI, steps, or facts from general knowledge.
- Pick the steps relevant to the topic (they may come from different recordings) and order them into a coherent workflow.
- If the pool does NOT genuinely cover the topic, set "covered" to false and give a one-sentence reason. Do not force a thin or speculative article.
- For each step, set "screenshotRef" to the exact event id whose screenshot best illustrates it (or "" if none).
- Write instructions imperatively ("Click ...", "Enter ..."). Keep them concrete and user-facing.`;

const schema = {
  name: 'prompt_article',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      covered: { type: 'boolean' },
      reason: { type: 'string' },
      title: { type: 'string' },
      intent: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      routes: { type: 'array', items: { type: 'string' } },
      preconditions: { type: 'array', items: { type: 'string' } },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            instruction: { type: 'string' },
            rationale: { type: 'string' },
            screenshotRef: { type: 'string' },
            expectedOutcome: { type: 'string' },
            uncertain: { type: 'boolean' },
          },
          required: ['instruction', 'rationale', 'screenshotRef', 'expectedOutcome', 'uncertain'],
        },
      },
    },
    required: ['covered', 'reason', 'title', 'intent', 'tags', 'routes', 'preconditions', 'steps'],
  },
} as const;

async function imageDataUrl(getArtifact: PromptArtifactReader, sourceId: string, ref?: FileRef): Promise<string | null> {
  if (!ref?.file) return null;
  const buf = await getArtifact(sourceId, ref.file);
  if (!buf) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Module 3.2 — synthesize ONE article for a topic from keyword-retrieved KB items (across
 * recordings), or decline. The LLM both judges coverage and selects/orders the relevant steps.
 */
export async function promptToArticle(input: {
  prompt: string;
  items: PromptItem[];
  getArtifact: PromptArtifactReader;
  apiKey: string;
  synthModel: string;
}): Promise<PromptToArticleResult> {
  if (input.items.length === 0) {
    return { covered: false, reason: 'Nothing has been recorded that touches this topic yet.' };
  }
  const openai = new OpenAI({ apiKey: input.apiKey });
  const eventsById = new Map(input.items.map((it) => [it.event.id, it]));

  const content: any[] = [
    {
      type: 'text',
      text: `Requested topic: "${input.prompt}".\nAssemble the article from the candidate steps below (each may be followed by its screenshot). Decline if they do not cover the topic.`,
    },
  ];

  let images = 0;
  for (const it of input.items) {
    const ev = it.event;
    const postRoute = ev.postAction?.route?.path;
    const routeChanged = postRoute && postRoute !== ev.route?.path ? ` -> navigates to ${postRoute}` : '';
    content.push({
      type: 'text',
      text:
        `Event id=${ev.id}: ${eventLabel(ev)}` +
        (ev.value ? ` | typed: "${ev.value}"` : '') +
        routeChanged +
        (it.narration ? `\n  narration: "${it.narration}"` : ''),
    });
    if (images < MAX_IMAGES) {
      const url = await imageDataUrl(input.getArtifact, it.sourceId, ev.screenshot);
      if (url) {
        content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
        images++;
      }
    }
  }

  const res = await openai.chat.completions.create({
    model: input.synthModel,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: schema as any },
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  let a: any;
  try {
    a = JSON.parse(raw);
  } catch {
    return { covered: false, reason: 'Could not assemble an article from the recorded material.' };
  }

  if (!a.covered || !Array.isArray(a.steps) || a.steps.length === 0) {
    return { covered: false, reason: a.reason || 'The recorded material does not cover this topic.' };
  }

  // Enrich each step with ground-truth selector/route/expectedOutcome from the referenced event.
  const steps: SynthStep[] = (a.steps as RawArticleStep[]).map((s) =>
    enrichStepFromEvent(s, s.screenshotRef ? eventsById.get(s.screenshotRef)?.event : undefined),
  );

  return {
    covered: true,
    article: {
      title: a.title || input.prompt,
      intent: a.intent || undefined,
      tags: a.tags || [],
      routes: a.routes || [],
      preconditions: a.preconditions || [],
      steps,
    },
  };
}
