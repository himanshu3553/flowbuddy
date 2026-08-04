import { prisma } from '@flowbuddy/db';
import type { CapturedEvent, Locator, SessionManifest } from '@flowbuddy/shared';
import { routeMatchStrength, routePattern } from '@flowbuddy/shared/route-pattern';
import {
  buildFingerprint,
  isIdentifiable,
  type ScreenFingerprint,
} from '@flowbuddy/shared/screen-fingerprint';
import { redactText } from '@flowbuddy/synthesis';

/**
 * P2-M0 — the SENSE PLAN: the compiled, probe-ready map of a workspace's APPROVED workflows the
 * widget uses to localize an end-user ("you're on step 3 of Create an invoice"). Per approved
 * workflow: ordered steps × ranked R13 locators + routes + step kind — founder-derived data only,
 * shipped DOWN to the widget (the locked hybrid architecture: docs/build/sense-and-reason.md §2.1).
 *
 * Serving is ROUTE-SHARDED and WORKFLOW-ATOMIC: `getSenseShard` returns only the workflows with a
 * step on/near the requested route — matched as a PATTERN (`route-pattern.ts`), so a workflow
 * recorded inside one record serves every record of that shape — but each workflow comes WHOLE
 * (all steps, including steps on other routes), so mid-workflow progression across URLs never needs
 * a refetch. Hub pages
 * are capped top-N by route specificity. NO-LEAK: only approved workflows are ever compiled.
 *
 * Locator recovery: distilled steps persist `keyEventId` (2026-07-08+) pointing at the manifest
 * event whose screen the step shows; older rows are matched by `screenshotFile` (both the action
 * and post-action frame carry the file name). A step whose event can't be recovered ships with
 * `locators: []` — the probe simply can't anchor on it (route evidence still applies).
 *
 * Compilation is ON DEMAND with a short per-workspace in-memory cache (the whole plan, all
 * approved workflows; shards are cut from it per request) — approval flips are visible within
 * CACHE_TTL_MS without any invalidation machinery.
 */

export interface SensePlanStep {
  /** 1-based position within the workflow (matches the step numbers answers cite). */
  index: number;
  instruction: string;
  /** The captured page path this step happens on ('' when unknown). */
  route: string;
  /** input = carries filled/empty evidence at probe time; action = click/nav/etc. */
  kind: 'input' | 'action';
  /** Ranked best-first (R13), capped — [] when the step's event couldn't be recovered. */
  locators: Locator[];
  /** Where the step lands when it navigates (route-progression evidence). */
  postRoute?: string;
  /** Which screen of the recording this step happened on — a key into the workflow's `screens`.
   *  Absent when that screen carried too little to be identified structurally. */
  screenKey?: string;
}

export interface SensePlanWorkflow {
  sourceId: string;
  segmentIndex: number;
  title: string;
  steps: SensePlanStep[];
  /**
   * Route pattern → what that screen LOOKED like when it was recorded. Carried per workflow rather
   * than per step (steps repeat screens) and per workflow rather than per shard (workflows already
   * flow everywhere the widget needs them, so nothing else has to be threaded through).
   * Absent on a recording too sparse to identify any screen — the widget then behaves exactly as
   * it did before fingerprints existed.
   */
  screens?: Record<string, ScreenFingerprint>;
}

export interface SenseShard {
  version: string;
  workflows: SensePlanWorkflow[];
}

const CACHE_TTL_MS = 60_000; // approval flips become visible within a minute
const MAX_WORKFLOWS_PER_SHARD = 8; // hub-page cap (top-N by route specificity)
const MAX_LOCATORS_PER_STEP = 6; // plenty for a probe walk; keeps shards small
/**
 * How many workflows the ROUTE didn't match may ride along for the widget to judge structurally.
 *
 * They only ever fill slots the route left empty, so a well-routed hub page ships exactly what it
 * shipped before. The cap is what stops "let the page decide" from degenerating into "send the whole
 * KB to every embed": every extra workflow is payload on someone else's site and locator resolution
 * inside a probe that must stay at ~ms.
 */
const MAX_STRUCTURAL_CANDIDATES = 4;

interface CachedPlan {
  at: number;
  version: string;
  workflows: SensePlanWorkflow[];
}
const planCache = new Map<string, CachedPlan>();

/** Tiny non-crypto hash for the plan version (FNV-1a over the compiled JSON). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const INPUT_TAGS = new Set(['input', 'textarea', 'select']);

function stepKind(ev: CapturedEvent | undefined): 'input' | 'action' {
  if (!ev) return 'action';
  const tag = (ev.target?.tag ?? '').toLowerCase();
  return ev.type === 'input' || INPUT_TAGS.has(tag) ? 'input' : 'action';
}

/** Ranked locators for a recovered event; positional css/xpath already ride at the tail (R13). */
function stepLocators(ev: CapturedEvent | undefined): Locator[] {
  if (!ev?.target) return [];
  const ranked = ev.target.locators ?? [];
  if (ranked.length > 0) return ranked.slice(0, MAX_LOCATORS_PER_STEP);
  // Pre-R13 captures: fall back to the positional selectors so old recordings stay probeable.
  const fallback: Locator[] = [];
  if (ev.target.cssPath) fallback.push({ strategy: 'css', value: ev.target.cssPath });
  if (ev.target.xpath) fallback.push({ strategy: 'xpath', value: ev.target.xpath });
  return fallback;
}

/**
 * Every screen this recording passed through → what it looked like.
 *
 * A screen is keyed by WHEN, not by where: a maximal run of consecutive events sharing a route
 * pattern. Keying by route instead would have defeated the whole point — on an app that lives at one
 * path (the case the URL can't serve at all) every screen of the recording would land in a single
 * bucket and identify nothing.
 *
 * The labels come from the elements the founder actually touched: an accessible name if the capture
 * has one, else the element's own visible text. Those are the app's chrome — button captions, field
 * labels, tab names — which is exactly what stays put when the record changes.
 *
 * KNOWN LIMIT, and it fails safe. Two screens with no route change between them (a wizard advancing
 * in place) merge into one run, so their anchors mix and neither screen recalls enough of the merged
 * set to clear the threshold. The fingerprint then declines to identify anything and the widget
 * behaves exactly as it did before — a miss, never a wrong screen.
 *
 * Two exclusions are deliberate: **typed values never enter** (a fingerprint is what the screen
 * says, not what the founder typed into it), and every label is scrubbed on the way out, because
 * this text ships to every embed and the account it was read from is the founder's own.
 */
function buildScreens(events: CapturedEvent[]): {
  screens: Map<string, ScreenFingerprint>;
  byEventId: Map<string, string>;
} {
  const runs: Array<{ key: string; title: string; labels: string[] }> = [];
  const byEventId = new Map<string, string>();
  let lastPattern: string | null = null;

  for (const ev of events) {
    const pattern = routePattern(ev.route?.path ?? '');
    let run = runs[runs.length - 1];
    if (!run || pattern !== lastPattern) {
      run = { key: `s${runs.length}`, title: ev.route?.title ?? '', labels: [] };
      runs.push(run);
      lastPattern = pattern;
    }
    if (!run.title && ev.route?.title) run.title = ev.route.title;
    const label = ev.target?.accessibleName || ev.target?.text || '';
    if (label) run.labels.push(label);
    byEventId.set(ev.id, run.key);
  }

  const screens = new Map<string, ScreenFingerprint>();
  for (const run of runs) {
    const fp = buildFingerprint(redactText(run.title), run.labels.map((l) => redactText(l)));
    if (isIdentifiable(fp)) screens.set(run.key, fp); // an unidentifiable screen is dead payload
  }
  for (const [eventId, key] of byEventId) if (!screens.has(key)) byEventId.delete(eventId);
  return { screens, byEventId };
}

/** The step fields the plan needs out of `KnowledgeItem.data` (distilled step shape). */
interface StepData {
  instruction?: string;
  route?: string;
  screenshotFile?: string | null;
  keyEventId?: string;
}

/** Compile the FULL plan (every approved workflow) for a workspace. */
async function compilePlan(workspaceId: string): Promise<CachedPlan> {
  const approvals = await prisma.copilotApproval.findMany({
    // P3-M0/M1: only LIVE workflows are compiled — probing one the founder replaced, or one a
    // reprocess could not verify, would localize users onto steps nobody has signed off.
    where: { workspaceId, inactiveReason: null },
    select: { workflowId: true },
  });
  if (approvals.length === 0) return { at: Date.now(), version: fnv1a('empty'), workflows: [] };
  const liveWorkflowIds = new Set(approvals.map((a) => a.workflowId));

  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null }, kind: 'step' },
    select: {
      workflowId: true,
      sourceId: true,
      segmentIndex: true,
      segmentTitle: true,
      orderIndex: true,
      data: true,
    },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
  });
  const approvedItems = items.filter((i) => liveWorkflowIds.has(i.workflowId));
  if (approvedItems.length === 0) return { at: Date.now(), version: fnv1a('empty'), workflows: [] };

  // Load each involved source's manifest ONCE and index its events by id AND by screenshot file
  // (action + post frames), so both the keyEventId path and the legacy screenshotFile path resolve.
  const sourceIds = [...new Set(approvedItems.map((i) => i.sourceId))];
  const sources = await prisma.knowledgeSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, manifest: true },
  });
  const eventIndex = new Map<string, { byId: Map<string, CapturedEvent>; byShot: Map<string, CapturedEvent> }>();
  // sourceId → the screens that recording passed through, and which one each event happened on.
  const screenIndex = new Map<string, ReturnType<typeof buildScreens>>();
  for (const s of sources) {
    const byId = new Map<string, CapturedEvent>();
    const byShot = new Map<string, CapturedEvent>();
    const events = ((s.manifest as unknown as SessionManifest | null)?.events ?? []) as CapturedEvent[];
    for (const ev of events) {
      byId.set(ev.id, ev);
      if (ev.screenshot?.file) byShot.set(ev.screenshot.file, ev);
      if (ev.postAction?.screenshot?.file) byShot.set(ev.postAction.screenshot.file, ev);
    }
    eventIndex.set(s.id, { byId, byShot });
    screenIndex.set(s.id, buildScreens(events));
  }

  // Group approved items into workflows (items arrive ordered by orderIndex within each group).
  const byWorkflow = new Map<string, SensePlanWorkflow>();
  for (const item of approvedItems) {
    const key = `${item.sourceId}:${item.segmentIndex}`;
    let wf = byWorkflow.get(key);
    if (!wf) {
      wf = {
        sourceId: item.sourceId,
        segmentIndex: item.segmentIndex as number,
        title: item.segmentTitle || 'Untitled workflow',
        steps: [],
      };
      byWorkflow.set(key, wf);
    }
    const d = (item.data ?? {}) as StepData;
    const idx = eventIndex.get(item.sourceId);
    const ev =
      (d.keyEventId ? idx?.byId.get(d.keyEventId) : undefined) ??
      (d.screenshotFile ? idx?.byShot.get(d.screenshotFile) : undefined);
    // `postRoute` exists to say "this step NAVIGATES" — so the comparison that decides whether to
    // emit it must be the same pattern comparison the widget will judge it with. Literally, a click
    // from /projects/123 to /projects/456 looks like a navigation; by pattern it is the same screen,
    // and shipping it would let the walkthrough count merely-being-there as a completed step.
    const postRoute = ev?.postAction?.route?.path;
    const navigates = !!postRoute && routePattern(postRoute) !== routePattern(ev?.route?.path ?? '');
    // The step inherits the screen its own captured moment happened on, and the workflow carries
    // only the screens its steps actually use.
    const scr = screenIndex.get(item.sourceId);
    const screenKey = ev ? scr?.byEventId.get(ev.id) : undefined;
    const fingerprint = screenKey ? scr?.screens.get(screenKey) : undefined;
    if (screenKey && fingerprint) {
      wf.screens = { ...(wf.screens ?? {}), [screenKey]: fingerprint };
    }
    wf.steps.push({
      index: wf.steps.length + 1,
      instruction: (d.instruction ?? '').slice(0, 200),
      route: (d.route ?? '').slice(0, 512),
      kind: stepKind(ev),
      locators: stepLocators(ev),
      ...(navigates ? { postRoute } : {}),
      ...(screenKey && fingerprint ? { screenKey } : {}),
    });
  }

  const workflows = [...byWorkflow.values()];
  return { at: Date.now(), version: fnv1a(JSON.stringify(workflows)), workflows };
}

async function getPlan(workspaceId: string): Promise<CachedPlan> {
  const cached = planCache.get(workspaceId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const plan = await compilePlan(workspaceId);
  planCache.set(workspaceId, plan);
  return plan;
}

/** Test-only: drop the compile cache. */
export function __resetSensePlanCache(): void {
  planCache.clear();
}

/**
 * The ROUTE SHARD: every approved workflow with a step on/near `route` — each served WHOLE
 * (workflow-atomic), capped top-N by route specificity (exact > prefix, then more matching steps).
 *
 * STRUCTURAL CANDIDATES (slice 1). The route is no longer the only way in. Workflows it didn't
 * match, but whose screens the widget could still RECOGNISE, fill the slots the route left empty —
 * which is the entire shard on a product that keeps its screens off the URL (one path for the whole
 * app, hash/query routing, or a bare `/`). Before this, such a product got an empty shard and Sense
 * was simply blind there, however unmistakable the page was.
 *
 * The route still wins where it speaks: matched workflows are ranked first and take their slots
 * first, so a well-routed page ships exactly what it shipped before, plus at most
 * MAX_STRUCTURAL_CANDIDATES extras. Only workflows carrying an identifiable screen are eligible —
 * an old recording with nothing to recognise is dead payload, and stays home.
 */
export async function getSenseShard(workspaceId: string, route: string): Promise<SenseShard> {
  const plan = await getPlan(workspaceId);
  // The widget already sends a PATTERN (its cache key); patterning again is idempotent, so a caller
  // that sends a raw path — an older widget, a curl — shards identically.
  const ctx = routePattern(route || '');

  const scored = plan.workflows.map((wf) => {
    let best = 0;
    let matches = 0;
    for (const s of wf.steps) {
      const m = routeMatchStrength(s.route, ctx);
      if (m > 0) matches++;
      if (m > best) best = m;
    }
    return { wf, best, matches };
  });

  const routed = scored
    .filter((r) => r.best > 0)
    .sort((a, b) => b.best - a.best || b.matches - a.matches)
    .slice(0, MAX_WORKFLOWS_PER_SHARD);

  const slotsLeft = Math.min(MAX_WORKFLOWS_PER_SHARD - routed.length, MAX_STRUCTURAL_CANDIDATES);
  const structural =
    slotsLeft > 0
      ? scored
          .filter((r) => r.best === 0 && r.wf.screens && Object.keys(r.wf.screens).length > 0)
          // More recognisable screens first — a workflow the widget can place is worth more of the
          // budget than one it can only carry. Ties keep compile order, so the shard is stable.
          .sort((a, b) => Object.keys(b.wf.screens!).length - Object.keys(a.wf.screens!).length)
          .slice(0, slotsLeft)
      : [];

  return {
    version: plan.version,
    workflows: [...routed, ...structural].map((r) => r.wf),
  };
}
