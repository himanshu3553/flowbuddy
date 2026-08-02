import OpenAI from 'openai';
import { createLogger } from '@flowbuddy/logger';
import { redactText } from './redact';
import { structuredJsonCall } from './responses';
import { cosine, matchWorkflowIdentities } from './overlap';

const log = createLogger('pages');

/**
 * AIL slice 2 (docs/build/application-intelligence.md) — extract PRODUCT KNOWLEDGE PAGES from a
 * recording's narration: what things ARE, what plans include, what a setting does. The complement
 * of workflows (how things are DONE), harvested from the half of the narration the segmenter
 * throws away.
 *
 * The trust posture, in order of importance:
 *  1. **Quote-anchored or dropped.** Every page must carry verbatim narration quotes, and
 *     `validateExtractedPages` DROPS any page whose quotes can't be found in the transcript. This
 *     is the pages' analog of steps citing captured event ids: prose that can't point at the
 *     founder's own words does not enter the KB, however plausible it reads.
 *  2. **Empty is legal.** A click-commentary recording yields zero pages, and the prompt says so
 *     explicitly. Tuning must never drift toward squeezing — padded pages are model invention
 *     inside the trust boundary, the exact thing this layer's design exists to prevent.
 *  3. **Pages never instruct.** "Background may orient and redirect; only workflows may instruct"
 *     — the no-overlap contract, one level up from Workflow.description. No overlap is why no
 *     precedence rule is needed anywhere downstream.
 *
 * Best-effort like describe.ts: extraction failing must not fail a recording that otherwise
 * processed perfectly — pages are additive.
 */

// One call reads the whole tour (same window as the recording description in describe.ts).
const PAGES_TRANSCRIPT_CHARS = 24_000;
const MAX_PAGES = 12; // a workspace's product knowledge grows across recordings, not per recording
const MAX_TITLE_CHARS = 80;
const MAX_PAGE_CONTENT_CHARS = 2000;
const MAX_QUOTES_PER_PAGE = 3;
const MAX_QUOTE_CHARS = 240;
/**
 * Identity gate for "this extracted page IS that stored page". Single-vector cosine over
 * title+content. ⚠️ Calibrated on ONE workspace's narration (the Chatful AI tour) — expect to
 * revisit once a second product exists. Above it: same page. Below it: a new page, born unapproved
 * (the fail-closed direction, same as workflow identity).
 */
export const PAGE_MATCH_THRESHOLD = 0.75;
/**
 * Above this, a re-derivation is the SAME content re-worded — provenance refreshes, text stands.
 * Between the two thresholds the page is the same but says something different: for an approved
 * page that parks as a pending update for the founder to accept or dismiss, never a silent change.
 */
export const PAGE_CONTENT_AGREE_THRESHOLD = 0.9;

const SYSTEM = `You extract PRODUCT KNOWLEDGE PAGES from the narration of a product recording, for an in-app help copilot.

You get the narration transcript and the list of task workflows already extracted from this recording.

Extract what the narrator EXPLAINED — what things are, how they relate, what plans include — as pages:
- "overview" (at most one): what the product is and who it's for, in the narrator's own telling.
- "area" pages: one per product AREA the narration actually describes — a region of the product (a dashboard, an analytics section): what lives there and what it's for. Only when the narrator SAID what it's for.
- "concept" pages: one per product concept the narration actually EXPLAINS — the plan/pricing structure, a named feature, a term the product uses, a setting and what it does. One concept per page.

Hard rules:
- Use ONLY what the narration says. NEVER add facts, features, numbers, limits, or plans from general knowledge about similar products — if the narration doesn't say it, it does not exist.
- NEVER write instructions. No "click", no "go to", no step-by-step — the workflows own HOW; pages own WHAT and WHY. Refer to tasks by name ("creating a project") and leave the how to the workflows.
- Only extract what was EXPLAINED, not what was merely done on screen. A narrator clicking through billing without describing it yields NO billing page.
- Every page must carry "quotes": 1 to 3 snippets copied VERBATIM from the transcript that ground the page. If you cannot quote it, you cannot write it.
- Every page may carry "related": 0 to 3 titles copied EXACTLY from the workflow list above, naming the tasks a reader of this page most likely wants next (the page about projects → the workflow that creates one). Only titles from the list; never invent one.
- Keep pages short and factual, plain prose. Numbers and prices exactly as narrated.
- It is correct to return FEW pages, or none at all. Empty is better than padded.`;

const schema = {
  name: 'product_pages',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['overview', 'area', 'concept'] },
            title: { type: 'string' },
            content: { type: 'string' },
            quotes: { type: 'array', items: { type: 'string' } },
            related: { type: 'array', items: { type: 'string' } },
          },
          required: ['type', 'title', 'content', 'quotes', 'related'],
        },
      },
    },
    required: ['pages'],
  },
} as const;

export interface ExtractedPage {
  type: 'overview' | 'area' | 'concept';
  title: string;
  content: string;
  /** Verbatim narration snippets that ground the page — validated against the transcript. */
  quotes: string[];
  /** Slice 3 — workflow TITLES this page points at ("the how lives there"), validated against the
   *  recording's actual workflow list the same way quotes are validated against the transcript:
   *  a title that isn't on the list is dropped. The worker resolves survivors to workflow ids. */
  related: string[];
}

/** Whitespace/case/curly-quote-insensitive form, so a transcription's typography can't fail an
 *  honest quote. Deliberately NOT fuzzier than that: a paraphrase is not an anchor. */
function normalizeForAnchor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_RELATED_PER_PAGE = 3;

/**
 * Shape-check, clamp, and — the part that matters — ANCHOR the model's raw output. A page keeps
 * only the quotes that literally appear in the transcript (a page with no surviving quote is
 * dropped entirely) and only the related titles that name real workflows from this recording.
 * Pure and exported for tests.
 */
export function validateExtractedPages(
  raw: unknown,
  transcriptText: string,
  workflowTitles: string[] = [],
): ExtractedPage[] {
  const hay = normalizeForAnchor(transcriptText);
  const knownTitles = new Map(workflowTitles.map((t) => [normalizeForAnchor(t), t]));
  const pages = Array.isArray((raw as { pages?: unknown })?.pages)
    ? ((raw as { pages: unknown[] }).pages as unknown[])
    : [];

  const out: ExtractedPage[] = [];
  const seenTitles = new Set<string>();
  let haveOverview = false;
  for (const entry of pages) {
    if (out.length >= MAX_PAGES) break;
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as {
      type?: unknown;
      title?: unknown;
      content?: unknown;
      quotes?: unknown;
      related?: unknown;
    };
    const type =
      p.type === 'overview' || p.type === 'area' || p.type === 'concept' ? p.type : null;
    const title = typeof p.title === 'string' ? p.title.trim().slice(0, MAX_TITLE_CHARS) : '';
    const content =
      typeof p.content === 'string' ? p.content.trim().slice(0, MAX_PAGE_CONTENT_CHARS) : '';
    if (!type || !title || !content) continue;
    if (type === 'overview' && haveOverview) continue;
    const titleKey = normalizeForAnchor(title);
    if (seenTitles.has(titleKey)) continue;

    const quotes = (Array.isArray(p.quotes) ? p.quotes : [])
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.trim().slice(0, MAX_QUOTE_CHARS))
      .filter((q) => q.length > 0 && hay.includes(normalizeForAnchor(q)))
      .slice(0, MAX_QUOTES_PER_PAGE);
    // Unanchored = unciteable = out. This is the line between "derived" and "invented".
    if (quotes.length === 0) continue;

    // Same anchor discipline for links: a related title must name a workflow that actually exists
    // in this recording. Canonical spelling comes from the list, not from the model.
    const related = [
      ...new Set(
        (Array.isArray(p.related) ? p.related : [])
          .filter((t): t is string => typeof t === 'string')
          .map((t) => knownTitles.get(normalizeForAnchor(t)))
          .filter((t): t is string => Boolean(t)),
      ),
    ].slice(0, MAX_RELATED_PER_PAGE);

    seenTitles.add(titleKey);
    if (type === 'overview') haveOverview = true;
    out.push({ type, title: redactText(title), content: redactText(content), quotes, related });
  }
  return out;
}

/** Extract pages from one recording's narration. Best-effort: any failure returns `[]`. */
export async function extractProductPages(
  openai: OpenAI,
  model: string,
  workflowTitles: string[],
  transcriptText: string,
): Promise<ExtractedPage[]> {
  const text = transcriptText.trim();
  if (!text) return [];

  const user = [
    'WORKFLOWS ALREADY EXTRACTED FROM THIS RECORDING (the HOW lives there — never restate it):',
    workflowTitles.length > 0
      ? workflowTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '(none)',
    '',
    'NARRATION TRANSCRIPT:',
    text.slice(0, PAGES_TRANSCRIPT_CHARS),
  ].join('\n');

  try {
    const raw = await structuredJsonCall({
      openai,
      model,
      system: SYSTEM,
      user,
      schema: schema as unknown as {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      },
      stage: 'extract-pages',
    });
    const parsed = JSON.parse(raw || '{}') as unknown;
    const pages = validateExtractedPages(parsed, text, workflowTitles);
    log.info(
      { component: 'extract-pages', proposed: (parsed as { pages?: unknown[] })?.pages?.length ?? 0, anchored: pages.length },
      'extracted product pages',
    );
    return pages;
  } catch (e) {
    log.warn(
      { component: 'extract-pages', err: e instanceof Error ? e.message : String(e) },
      'page extraction failed — recording proceeds without pages',
    );
    return [];
  }
}

/** The embedding input for a page — one vector covers identity AND retrieval, like step items. */
export function pageEmbedText(title: string, content: string): string {
  return `${title}\n${content}`;
}

export interface PageFingerprint<K> {
  key: K;
  vector: number[];
}

/**
 * Which extracted pages ARE which stored pages. Greedy best-first one-to-one over a single cosine
 * gate — `matchWorkflowIdentities` with its two gates collapsed onto the one vector a page has
 * (pages have no step sequence, so there is no separate "goal" signal to require).
 * Unmatched incoming = a genuinely new page, born unapproved. Unmatched existing = simply not
 * mentioned this time — pages are never retired by silence.
 */
export function matchPageIdentities<I, E>(
  incoming: PageFingerprint<I>[],
  existing: PageFingerprint<E>[],
  threshold = PAGE_MATCH_THRESHOLD,
): Map<I, E> {
  return matchWorkflowIdentities(
    incoming.map((p) => ({ key: p.key, centroid: p.vector, goal: p.vector })),
    existing.map((p) => ({ key: p.key, centroid: p.vector, goal: p.vector })),
    { threshold, lastStepThreshold: threshold },
  );
}

/** Cosine over page vectors — exported for the worker's content-agree check. */
export function pageSimilarity(a: number[], b: number[]): number {
  return cosine(a, b);
}
