import { prisma } from '@sync/db';
import type { CapturedEvent, Locator, SessionManifest } from '@sync/shared';

/**
 * P2-M0 — the SENSE PLAN: the compiled, probe-ready map of a workspace's APPROVED workflows the
 * widget uses to localize an end-user ("you're on step 3 of Create an invoice"). Per approved
 * workflow: ordered steps × ranked R13 locators + routes + step kind — founder-derived data only,
 * shipped DOWN to the widget (the locked hybrid architecture: docs/phase-2-sense.md §2.1).
 *
 * Serving is ROUTE-SHARDED and WORKFLOW-ATOMIC: `getSenseShard` returns only the workflows with a
 * step on/near the requested route — but each matched workflow comes WHOLE (all steps, including
 * steps on other routes), so mid-workflow progression across URLs never needs a refetch. Hub pages
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
}

export interface SensePlanWorkflow {
  sourceId: string;
  segmentIndex: number;
  title: string;
  steps: SensePlanStep[];
}

export interface SenseShard {
  version: string;
  workflows: SensePlanWorkflow[];
}

const CACHE_TTL_MS = 60_000; // approval flips become visible within a minute
const MAX_WORKFLOWS_PER_SHARD = 8; // hub-page cap (top-N by route specificity)
const MAX_LOCATORS_PER_STEP = 6; // plenty for a probe walk; keeps shards small

interface CachedPlan {
  at: number;
  version: string;
  workflows: SensePlanWorkflow[];
}
const planCache = new Map<string, CachedPlan>();

/** Trim trailing slashes; '' → '/'. (Mirrors retrieval's route normalization.) */
function normalizePath(p: string): string {
  const s = p.trim().replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

/**
 * Same segment-boundary matching retrieval uses (never raw substring; a root path carries no
 * screen information and matches nothing). Returns the match strength for ranking:
 * 2 = exact, 1 = segment-boundary prefix (either direction), 0 = no match.
 */
function routeMatchStrength(stepRoute: string, ctx: string): number {
  if (!stepRoute || !ctx) return 0;
  const route = normalizePath(stepRoute);
  if (route === '/' || ctx === '/') return 0;
  if (route === ctx) return 2;
  if (route.startsWith(ctx + '/') || ctx.startsWith(route + '/')) return 1;
  return 0;
}

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
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true },
  });
  if (approvals.length === 0) return { at: Date.now(), version: fnv1a('empty'), workflows: [] };
  const approvedKeys = new Set(approvals.map((a) => `${a.sourceId}:${a.segmentIndex}`));

  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null }, kind: 'step' },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true, orderIndex: true, data: true },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
  });
  const approvedItems = items.filter((i) => approvedKeys.has(`${i.sourceId}:${i.segmentIndex}`));
  if (approvedItems.length === 0) return { at: Date.now(), version: fnv1a('empty'), workflows: [] };

  // Load each involved source's manifest ONCE and index its events by id AND by screenshot file
  // (action + post frames), so both the keyEventId path and the legacy screenshotFile path resolve.
  const sourceIds = [...new Set(approvedItems.map((i) => i.sourceId))];
  const sources = await prisma.knowledgeSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, manifest: true },
  });
  const eventIndex = new Map<string, { byId: Map<string, CapturedEvent>; byShot: Map<string, CapturedEvent> }>();
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
        title:
          item.segmentTitle ||
          approvals.find((a) => `${a.sourceId}:${a.segmentIndex}` === key)?.segmentTitle ||
          'Untitled workflow',
        steps: [],
      };
      byWorkflow.set(key, wf);
    }
    const d = (item.data ?? {}) as StepData;
    const idx = eventIndex.get(item.sourceId);
    const ev =
      (d.keyEventId ? idx?.byId.get(d.keyEventId) : undefined) ??
      (d.screenshotFile ? idx?.byShot.get(d.screenshotFile) : undefined);
    const postRoute = ev?.postAction?.route?.path;
    wf.steps.push({
      index: wf.steps.length + 1,
      instruction: (d.instruction ?? '').slice(0, 200),
      route: (d.route ?? '').slice(0, 512),
      kind: stepKind(ev),
      locators: stepLocators(ev),
      ...(postRoute && postRoute !== ev?.route?.path ? { postRoute } : {}),
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
 * A root/blank route carries no screen information → empty shard (the probe has nothing to anchor).
 */
export async function getSenseShard(workspaceId: string, route: string): Promise<SenseShard> {
  const plan = await getPlan(workspaceId);
  const ctx = normalizePath(route || '');
  if (ctx === '/') return { version: plan.version, workflows: [] };

  const ranked = plan.workflows
    .map((wf) => {
      let best = 0;
      let matches = 0;
      for (const s of wf.steps) {
        const m = routeMatchStrength(s.route, ctx);
        if (m > 0) matches++;
        if (m > best) best = m;
      }
      return { wf, best, matches };
    })
    .filter((r) => r.best > 0)
    .sort((a, b) => b.best - a.best || b.matches - a.matches);

  return {
    version: plan.version,
    workflows: ranked.slice(0, MAX_WORKFLOWS_PER_SHARD).map((r) => r.wf),
  };
}
