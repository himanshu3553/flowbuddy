/**
 * SCREEN FINGERPRINTS — recognising a screen by what is ON it, not by its address.
 *
 * The URL answers "which screen" only on products that put screens in their URLs. Three cases it
 * cannot answer at all, and all three are ordinary: an app that lives at one path, a tab/modal/
 * drawer that changes the view without changing the address, and — since routes became patterns —
 * several workflows legitimately sharing `/projects/:id`. In each, the page itself is the only
 * evidence there is.
 *
 * WHAT A FINGERPRINT IS. A screen's title plus a small set of ANCHORS — the short visible labels
 * of the things the founder actually touched there (button text, field labels, accessible names).
 * Derived from the recording's own manifest, so it costs no new capture and no DOM snapshot fetch.
 *
 * WHY OVERLAP AND NOT EQUALITY. The founder recorded inside their own account, so their page says
 * "Acme Corp — Team" and their customer's says "Globex — Team". This is the same lesson routes just
 * learned: record-specific words differ, screen-specific words don't. So we score the RECALL of the
 * recorded anchors ("how much of what I saw is here?") and never require equality. Extra live text
 * costs nothing, which is the right asymmetry — apps add chrome, they rarely remove labels.
 *
 * WHY A FLOOR ON ANCHOR COUNT. Two anchors are a coincidence, not an identification. Below
 * MIN_ANCHORS a fingerprint refuses to score at all rather than claim weak evidence, because the
 * consumer treats any score above the threshold as "this is the screen".
 *
 * Consequence bound, same as routes: this is a ranking SIGNAL and a widget aim, never the approval
 * gate. A wrong fingerprint costs one mediocre answer; it can never serve unapproved content.
 *
 * Tuning constants:
 *   MIN_ANCHORS       = 3    — below this a screen cannot be identified structurally
 *   MAX_ANCHORS       = 12   — payload cap per screen; anchors ride the sense plan to every embed
 *   MAX_ANCHOR_CHARS  = 48   — labels are short; a paragraph is content, not an anchor
 *   ANCHOR_WEIGHT/TITLE_WEIGHT = 0.8/0.2 — the title MULTIPLIES the anchor evidence rather than
 *                              adding to it, so it can corroborate a match but never manufacture
 *                              one: half of a title is usually the customer's own record name, and
 *                              the other half is the same on every screen of the app
 *   SCREEN_MATCH_MIN  = 0.5  — the score at which a consumer may act on "this is the screen"
 */

const MIN_ANCHORS = 3;
const MAX_ANCHORS = 12;
const MAX_ANCHOR_CHARS = 48;
const ANCHOR_WEIGHT = 0.8;
const TITLE_WEIGHT = 0.2;
export const SCREEN_MATCH_MIN = 0.5;

/** Title words this short, or purely numeric, carry no screen information. */
const MIN_TITLE_TOKEN = 3;

export interface ScreenFingerprint {
  /** The document title as recorded, normalized. */
  title?: string;
  /** Normalized, deduped, capped visible labels seen on this screen. */
  anchors: string[];
}

/** What the live page looks like right now — the widget's half, as plain data (no DOM in shared). */
export interface LiveScreen {
  title: string;
  anchors: string[];
}

/**
 * One label → its comparable form. Returns '' for anything that isn't a label: too short, too long
 * (that's a paragraph), or pure digits (that's a record — an order number, a count badge).
 */
export function normalizeAnchor(raw: string): string {
  const s = (raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLowerCase();
  if (s.length < 2 || s.length > MAX_ANCHOR_CHARS) return '';
  if (/^\d+$/.test(s)) return '';
  return s;
}

/** Title → its content words. Splits the usual separators, drops short and numeric tokens. */
export function titleTokens(title: string | undefined): string[] {
  if (!title) return [];
  const tokens = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_TITLE_TOKEN && !/^\d+$/.test(t));
  return [...new Set(tokens)];
}

/** Build a screen's fingerprint from raw recorded labels. Order-stable, deduped, capped. */
export function buildFingerprint(title: string | undefined, rawAnchors: string[]): ScreenFingerprint {
  const seen = new Set<string>();
  const anchors: string[] = [];
  for (const raw of rawAnchors) {
    const a = normalizeAnchor(raw);
    if (!a || seen.has(a)) continue;
    seen.add(a);
    anchors.push(a);
    if (anchors.length >= MAX_ANCHORS) break;
  }
  const t = (title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return t ? { title: t, anchors } : { anchors };
}

/** Is there enough here to claim a screen's identity at all? */
export function isIdentifiable(fp: ScreenFingerprint | undefined): boolean {
  return !!fp && fp.anchors.length >= MIN_ANCHORS;
}

/**
 * The live page, normalized once.
 *
 * The caller scores a live page against every step of every candidate workflow, so normalizing its
 * few hundred labels inside the scorer would repeat that work tens of times per probe and dominate a
 * budget measured in milliseconds. Keyed on the LiveScreen object itself, so a caller gets the
 * caching by holding one object for the duration of a probe and nothing has to be threaded through.
 */
const preparedLive = new WeakMap<LiveScreen, { anchors: Set<string>; title: Set<string> }>();

function prepare(live: LiveScreen): { anchors: Set<string>; title: Set<string> } {
  const hit = preparedLive.get(live);
  if (hit) return hit;
  const anchors = new Set<string>();
  for (const raw of live.anchors) {
    const a = normalizeAnchor(raw);
    if (a) anchors.add(a);
  }
  const prepared = { anchors, title: new Set(titleTokens(live.title)) };
  preparedLive.set(live, prepared);
  return prepared;
}

/**
 * How much of the recorded screen is present on the live one: 0 (nothing, or not identifiable) to
 * 1. Recall of the recorded anchors, corroborated by the title — never the other way round.
 */
export function screenMatchScore(
  recorded: ScreenFingerprint | undefined,
  live: LiveScreen | undefined,
): number {
  if (!isIdentifiable(recorded) || !live) return 0;
  const { anchors: liveAnchors, title: liveTitle } = prepare(live);
  if (liveAnchors.size === 0) return 0;

  const hits = recorded!.anchors.filter((a) => liveAnchors.has(a)).length;
  const anchorScore = hits / recorded!.anchors.length;

  const recordedTitle = titleTokens(recorded!.title);
  const titleScore = recordedTitle.length
    ? recordedTitle.filter((t) => liveTitle.has(t)).length / recordedTitle.length
    : 0;

  // MULTIPLICATIVE, not additive. Added, a matching title alone could carry a screen over the
  // threshold on half its anchors — and a title is the cheapest thing in a web app to share between
  // screens ("MyApp" on all of them). Multiplied, the title can only ever AMPLIFY evidence the page
  // actually provided: no anchors, no score, however perfect the title.
  const score = anchorScore * (ANCHOR_WEIGHT + TITLE_WEIGHT * titleScore);
  return Math.min(1, Math.round(score * 100) / 100);
}
