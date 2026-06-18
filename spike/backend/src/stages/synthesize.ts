import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { openai } from '../openai.js';
import { bundleFilePath } from '../storage.js';
import { eventLabel } from './segment.js';
import type { Article, CapturedEvent, Segment, Step } from '../types.js';

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

async function imageDataUrl(id: string, ref?: { file: string }): Promise<string | null> {
  if (!ref?.file) return null;
  try {
    const buf = await readFile(bundleFilePath(id, ref.file));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function synthesizeArticle(
  sessionId: string,
  seg: Segment,
  eventsById: Map<string, CapturedEvent>,
  narration: Map<string, string>,
): Promise<Article> {
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
      const url = await imageDataUrl(sessionId, ev.screenshot);
      if (url) {
        content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
        imageCount++;
      }
    }
  }

  const res = await openai().chat.completions.create({
    model: config.synthModel,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: schema as any },
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  let article: Article;
  try {
    article = JSON.parse(raw) as Article;
  } catch {
    article = { title: seg.title, steps: [] };
  }

  // Deterministically enrich steps with selector/route/expectedOutcome from the
  // referenced event — these are ground truth from capture, not for the LLM to invent.
  article.sourceSessionId = sessionId;
  article.steps = (article.steps || []).map((s: Step) => {
    const ev = s.screenshotRef ? eventsById.get(s.screenshotRef) : undefined;
    if (ev) {
      s.selector = ev.target?.cssPath || ev.target?.xpath;
      s.route = ev.route?.path;
      if (!s.expectedOutcome) {
        const postRoute = ev.postAction?.route?.path;
        if (postRoute && postRoute !== ev.route?.path) {
          s.expectedOutcome = `The app navigates to ${postRoute}.`;
        }
      }
    }
    return s;
  });

  return article;
}

export async function synthesize(
  sessionId: string,
  segments: Segment[],
  events: CapturedEvent[],
  narration: Map<string, string>,
): Promise<Article[]> {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const articles: Article[] = [];
  for (const seg of segments) {
    articles.push(await synthesizeArticle(sessionId, seg, eventsById, narration));
  }
  return articles;
}
