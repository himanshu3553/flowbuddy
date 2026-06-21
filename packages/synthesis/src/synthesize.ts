import OpenAI from 'openai';
import type { CapturedEvent, FileRef } from '@sync/shared';
import { eventLabel, type Segment } from './segment';
import type { ArtifactReader } from './types';

export interface SynthStep {
  instruction: string;
  rationale?: string;
  screenshotEventId?: string; // event whose screenshot illustrates this step
  selector?: string;
  route?: string;
  expectedOutcome?: string;
  uncertain?: boolean;
}

export interface SynthArticle {
  title: string;
  intent?: string;
  tags: string[];
  routes: string[];
  preconditions: string[];
  steps: SynthStep[];
}

/** The raw step shape the LLM returns (before grounding enrichment). */
export interface RawArticleStep {
  instruction: string;
  rationale?: string;
  screenshotRef?: string;
  expectedOutcome?: string;
  uncertain?: boolean;
}

/**
 * Turn one raw LLM step into a grounded `SynthStep`: keep the model's instruction/rationale, but
 * fill `selector`/`route`/`expectedOutcome` from the referenced captured event — ground truth, not
 * for the LLM to invent. Shared by auto synthesis (synthOne) and prompt-to-article.
 */
export function enrichStepFromEvent(raw: RawArticleStep, event?: CapturedEvent): SynthStep {
  const step: SynthStep = {
    instruction: raw.instruction,
    rationale: raw.rationale || undefined,
    screenshotEventId: raw.screenshotRef || undefined,
    expectedOutcome: raw.expectedOutcome || undefined,
    uncertain: Boolean(raw.uncertain),
  };
  if (event) {
    step.selector = event.target?.cssPath || event.target?.xpath;
    step.route = event.route?.path;
    if (!step.expectedOutcome) {
      const postRoute = event.postAction?.route?.path;
      if (postRoute && postRoute !== event.route?.path) {
        step.expectedOutcome = `The app navigates to ${postRoute}.`;
      }
    }
  }
  return step;
}

const MAX_IMAGES_PER_SEGMENT = 30;

const SYSTEM = `You turn ONE captured product workflow into a precise, step-by-step help article.

Strict grounding rules:
- Use ONLY the provided captured events, narration, and screenshots. Never invent steps, UI, or details from general knowledge.
- The narration explains the WHY; the events/screenshots are the WHAT.
- If something is unclear or unsupported by the capture, mark that step "uncertain": true rather than guessing.
- For each step, set "screenshotRef" to the exact event id whose screenshot best illustrates it (or "" if none).
- Write instructions imperatively ("Click ...", "Enter ..."). Keep them concrete and user-facing.`;

const schema = {
  name: 'article',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
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
    required: ['title', 'intent', 'tags', 'routes', 'preconditions', 'steps'],
  },
} as const;

async function imageDataUrl(getArtifact: ArtifactReader, ref?: FileRef): Promise<string | null> {
  if (!ref?.file) return null;
  const buf = await getArtifact(ref.file);
  if (!buf) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function synthOne(
  openai: OpenAI,
  model: string,
  seg: Segment,
  eventsById: Map<string, CapturedEvent>,
  narration: Map<string, string>,
  getArtifact: ArtifactReader,
): Promise<SynthArticle> {
  const segEvents = seg.eventIds
    .map((id) => eventsById.get(id))
    .filter((e): e is CapturedEvent => Boolean(e));

  const content: any[] = [
    {
      type: 'text',
      text: `Workflow working title: "${seg.title}".\nBuild the help article from the events below (in order). Each event may be followed by its screenshot.`,
    },
  ];

  let imageCount = 0;
  for (const ev of segEvents) {
    const n = narration.get(ev.id);
    const postRoute = ev.postAction?.route?.path;
    const routeChanged = postRoute && postRoute !== ev.route?.path ? ` -> navigates to ${postRoute}` : '';
    content.push({
      type: 'text',
      text:
        `Event id=${ev.id}: ${eventLabel(ev)}` +
        (ev.value ? ` | typed: "${ev.value}"` : '') +
        routeChanged +
        (n ? `\n  narration: "${n}"` : ''),
    });
    if (imageCount < MAX_IMAGES_PER_SEGMENT) {
      const url = await imageDataUrl(getArtifact, ev.screenshot);
      if (url) {
        content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
        imageCount++;
      }
    }
  }

  const res = await openai.chat.completions.create({
    model,
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
    a = { title: seg.title, steps: [] };
  }

  // Deterministically enrich each step with selector/route/expectedOutcome from the
  // referenced event — ground truth from capture, not for the LLM to invent.
  const steps: SynthStep[] = (a.steps ?? []).map((s: RawArticleStep) =>
    enrichStepFromEvent(s, s.screenshotRef ? eventsById.get(s.screenshotRef) : undefined),
  );

  return {
    title: a.title || seg.title,
    intent: a.intent || undefined,
    tags: a.tags || [],
    routes: a.routes || [],
    preconditions: a.preconditions || [],
    steps,
  };
}

export async function synthesizeArticles(
  openai: OpenAI,
  model: string,
  segments: Segment[],
  events: CapturedEvent[],
  narration: Map<string, string>,
  getArtifact: ArtifactReader,
): Promise<SynthArticle[]> {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const articles: SynthArticle[] = [];
  for (const seg of segments) {
    articles.push(await synthOne(openai, model, seg, eventsById, narration, getArtifact));
  }
  return articles;
}
