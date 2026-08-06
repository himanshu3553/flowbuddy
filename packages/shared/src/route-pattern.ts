/**
 * ROUTE MATCHING — the one definition of "is the screen this step was recorded on the screen the
 * end-user is standing on?"
 *
 * Routes are compared as PATTERNS, never as strings. A workflow recorded on
 * `/projects/6a6a49ca1a22045b0b32b353/settings` is the same screen as the one an end-user is on at
 * `/projects/9f21c0.../settings` — string equality says otherwise, and said it in three places at
 * once (the sense shard, the retrieval route boost, the widget probe + walkthrough). The effect was
 * invisible on a product whose URLs carry no ids and total on every product whose URLs do.
 *
 * WHAT COUNTS AS AN ID SEGMENT — deliberately conservative, because the two failure directions are
 * not symmetric. A missed id degrades to the old behaviour (a route signal that doesn't fire); a
 * false positive would declare two genuinely different screens identical. So a segment is an id
 * only when it is: all digits · a canonical UUID · hex of ID_MIN_HEX+ chars (Mongo ObjectId, git
 * sha) · or a separator-free token of ID_MIN_TOKEN+ chars mixing letters and digits (cuid, ULID).
 *
 * A segment containing `-` or `_` is NEVER an id — that is the slug shape (`2024-year-in-review`,
 * `api-keys-v2`), and treating those as ids would collapse a blog into one screen. The cost is that
 * separator-carrying ids (nanoid `V1StGXR8_Z5jdHi6B-myT`, Stripe `cus_NffrFeUfNV2Hib`) read as
 * static — safe, and the direction we chose.
 *
 * Consequence bound: a route is a ranking SIGNAL and a widget aim, never the approval gate — the
 * gate keys on workflow identity (see the retrieval header). A wrong pattern costs one mediocre
 * answer; it can never serve unapproved content.
 *
 * The placeholder is idempotent — `routePattern(routePattern(p)) === routePattern(p)` — which is
 * what lets the widget send a PATTERN as its sense-plan cache/fetch key and the server pattern it
 * again on arrival without the two disagreeing. `route-pattern.test.ts` pins that.
 *
 * Tuning constants:
 *   ID_MIN_HEX   = 16 — below this, hex is indistinguishable from a word (`beadface` is 8)
 *   ID_MIN_TOKEN = 12 — cuid/ULID/nanoid length floor; short mixed segments like `v2` stay static
 *   ID_PLACEHOLDER / DISPLAY_ELISION — the pattern token, and what a human is shown instead
 */

const ID_MIN_HEX = 16;
const ID_MIN_TOKEN = 12;
const ID_PLACEHOLDER = ':id';
const DISPLAY_ELISION = '…';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_RE = /^\d+$/;
const HEX_RE = new RegExp(`^[0-9a-f]{${ID_MIN_HEX},}$`, 'i');
const TOKEN_RE = new RegExp(`^[0-9a-z]{${ID_MIN_TOKEN},}$`, 'i');

/**
 * Trim trailing slashes and drop any query/hash; '' → '/'.
 *
 * The query strip is defensive rather than cosmetic: `contextPath` arrives from any page holding
 * the public key, so a host that reports `/projects?id=1` must not silently stop matching.
 */
export function normalizePath(p: string): string {
  const s = (p || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

/** Does this path segment identify a RECORD rather than a SCREEN? See the header for the rule. */
export function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  if (DIGITS_RE.test(segment)) return true;
  if (UUID_RE.test(segment)) return true;
  if (HEX_RE.test(segment)) return true;
  // Separator-free, long, and mixing both alphabets — a generated token, not a word.
  return TOKEN_RE.test(segment) && /\d/.test(segment) && /[a-z]/i.test(segment);
}

/** Normalized path with every id segment replaced by `:id`. Idempotent. */
export function routePattern(path: string): string {
  const norm = normalizePath(path);
  if (norm === '/') return '/';
  return (
    '/' +
    norm
      .split('/')
      .filter(Boolean)
      .map((seg) => (isIdSegment(seg) ? ID_PLACEHOLDER : seg))
      .join('/')
  );
}

/**
 * How well two routes describe the same screen: 2 = same, 1 = segment-boundary prefix (either
 * direction), 0 = unrelated.
 *
 * The root never PREFIX-matches anything — without that, a `/` context matched every item and
 * turned the signal into uniform noise (review hardening 2026-07-07). But two parties BOTH at `/`
 * are on the same screen (added 2026-08-05): a workflow whose first step was recorded on the
 * landing page could never match even a user standing exactly there, which left the walkthrough
 * and the acting run saying "head to /" forever on the very page they meant. An EMPTY path stays
 * unmatched either way — '' means the route is unknown, not that it was recorded at the root.
 */
export function routeMatchStrength(a: string, b: string): number {
  if (!a || !b) return 0;
  const pa = routePattern(a);
  const pb = routePattern(b);
  if (pa === '/' || pb === '/') return pa === pb ? 2 : 0;
  if (pa === pb) return 2;
  if (pa.startsWith(pb + '/') || pb.startsWith(pa + '/')) return 1;
  return 0;
}

/**
 * The path as it may be shown to an END-USER — id segments elided, never rendered.
 *
 * A recorded route is the FOUNDER's own URL, so printing it raw hands a stranger a real record id
 * out of the founder's account ("This step happens on /projects/6a6a49ca/settings"). The widget's
 * off-route guidance is the one place this reaches a human, and it must go through here.
 */
export function displayRoute(path: string): string {
  const norm = normalizePath(path);
  if (norm === '/') return '/';
  return (
    '/' +
    norm
      .split('/')
      .filter(Boolean)
      .map((seg) => (isIdSegment(seg) || seg === ID_PLACEHOLDER ? DISPLAY_ELISION : seg))
      .join('/')
  );
}
