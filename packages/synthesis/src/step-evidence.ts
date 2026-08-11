import type { CapturedEvent } from '@flowbuddy/shared';
import { routePattern } from '@flowbuddy/shared/route-pattern';
import { redactText } from './redact';
import { extractAppearedMarkers, SNAPSHOT_MAX_CHARS } from './execution-plan';

/**
 * P3-M2 — the STEP EVIDENCE layer (docs/build/execution-contracts.md, EC-1/EC-10): what each step's
 * success LOOKED like on the founder's own screen, extracted deterministically from the recording's
 * before/after artifacts at PROCESSING time and stored in the step rows — one layer, three
 * consumers (answers · Sense/Reason · the acting run). No model call anywhere in here.
 *
 * Evidence lives in `KnowledgeItem.data` (the distilled step), NEVER in the item's `text`: text
 * feeds embeddings and retrieval, and marker phrases there would pollute both.
 *
 * Tuning constants:
 *   DISAPPEARED_MAX = 3   — the inverse diff (the modal that closed, the item that left a list) is
 *     corroboration, not the headline; appeared markers keep MARKER_MAX (execution-plan.ts).
 *   EVIDENCE_MAX_STEPS = 40 — snapshot-fetch cap per workflow at build time (two artifact reads per
 *     step). The LAST step is always included — it anchors the workflow's outcome — then steps in
 *     order until the cap. Label/landedTitle need no snapshots and attach regardless.
 *   EVIDENCE_LABEL_MAX = 80 — same wire-hygiene cap as the plan's input-slot labels.
 */

const DISAPPEARED_MAX = 3;
const EVIDENCE_MAX_STEPS = 40;
const EVIDENCE_LABEL_MAX = 80;

/** What one step's recorded moment proves. Every field optional — evidence tightens, absence never
 *  loosens (the `expect.appeared` rule, generalized). All strings are scrubbed founder-page chrome:
 *  they ship DOWN to every embed inside the sense shard and the execution plan. */
export interface StepEvidence {
  /** Phrases NEWLY visible after the step succeeded (extractAppearedMarkers). */
  appeared?: string[];
  /** Phrases visible BEFORE and gone AFTER (the closed dialog, the removed row). Skipped when the
   *  recorded after-state timed out instead of settling — an unsettled snapshot can prove what
   *  appeared, never what is absent. */
  disappeared?: string[];
  /** The acted element's recorded label — the run's cross-check that a resolved element still says
   *  what the recording said. Dropped when scrubbing had to touch it: a label built on PII would
   *  never containment-match live text and would hand back every run. */
  label?: string;
  /** The landing page's recorded document title, for pattern-changing navigations — an audit
   *  corroborator, never a gate. */
  landedTitle?: string;
}

/** Inverse of `extractAppearedMarkers`: phrases that were on the founder's screen before the step
 *  and gone after it. Same scrubbing, same phrase bounds, tighter cap. */
export function extractDisappearedMarkers(preHtml: string, postHtml: string): string[] {
  return extractAppearedMarkers(postHtml, preHtml).slice(0, DISAPPEARED_MAX);
}

function cleanShort(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const scrubbed = redactText(raw).replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_LABEL_MAX);
  if (scrubbed.length < 3 || scrubbed.includes('[redacted')) return undefined;
  return scrubbed;
}

/** One step's evidence from its recovered event (+ optionally its before/after DOM snapshot text).
 *  Pure. Returns undefined when the moment proves nothing usable. */
export function extractStepEvidence(
  ev: CapturedEvent,
  snap: { pre?: string; post?: string },
): StepEvidence | undefined {
  const out: StepEvidence = {};

  if (snap.pre && snap.post) {
    const appeared = extractAppearedMarkers(snap.pre, snap.post);
    if (appeared.length > 0) out.appeared = appeared;
    if (ev.postAction?.settleReason !== 'timeout') {
      const disappeared = extractDisappearedMarkers(snap.pre, snap.post);
      if (disappeared.length > 0) out.disappeared = disappeared;
    }
  }

  if (ev.type !== 'nav') {
    const label = cleanShort(ev.target?.accessibleName || ev.target?.text);
    if (label) out.label = label;
  }

  const landed = ev.postAction?.route;
  if (landed?.path && routePattern(landed.path) !== routePattern(ev.route?.path ?? '')) {
    const landedTitle = cleanShort(landed.title);
    if (landedTitle) out.landedTitle = landedTitle;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Attach evidence to a workflow's distilled steps at BUILD time. Best-effort by construction:
 * an unreadable/oversized snapshot, an unrecovered event, or a read error leaves that step exactly
 * as it was — a recording whose KB builds cleanly must never fail over its evidence pass.
 * Pure by dependency injection: the caller supplies the artifact reader.
 */
export async function attachStepEvidence<
  T extends { keyEventId?: string; screenshotFile?: string | null },
>(
  steps: T[],
  events: CapturedEvent[],
  read: (file: string) => Promise<Buffer | null>,
): Promise<Array<T & { evidence?: StepEvidence }>> {
  const byId = new Map<string, CapturedEvent>();
  const byShot = new Map<string, CapturedEvent>();
  for (const ev of events) {
    byId.set(ev.id, ev);
    if (ev.screenshot?.file) byShot.set(ev.screenshot.file, ev);
    if (ev.postAction?.screenshot?.file) byShot.set(ev.postAction.screenshot.file, ev);
  }

  // Which steps get the (expensive) snapshot fetch: all of them up to the cap — except the last
  // step, which is always in (it anchors the outcome), displacing the latest in-order slot.
  const fetchable = new Set<number>();
  for (let i = 0; i < steps.length && fetchable.size < EVIDENCE_MAX_STEPS; i++) fetchable.add(i);
  if (steps.length > 0 && !fetchable.has(steps.length - 1)) {
    fetchable.delete(Math.max(...[...fetchable].filter((i) => i !== 0)));
    fetchable.add(steps.length - 1);
  }

  return Promise.all(
    steps.map(async (step, i) => {
      const ev =
        (step.keyEventId ? byId.get(step.keyEventId) : undefined) ??
        (step.screenshotFile ? byShot.get(step.screenshotFile) : undefined);
      if (!ev) return step;

      const snap: { pre?: string; post?: string } = {};
      const preFile = ev.domSnapshot?.file;
      const postFile = ev.postAction?.domSnapshot?.file;
      if (fetchable.has(i) && preFile && postFile) {
        try {
          const [pre, post] = await Promise.all([read(preFile), read(postFile)]);
          if (pre && post && pre.length <= SNAPSHOT_MAX_CHARS && post.length <= SNAPSHOT_MAX_CHARS) {
            snap.pre = pre.toString('utf8');
            snap.post = post.toString('utf8');
          }
        } catch {
          // best-effort: this step simply carries no snapshot-derived evidence
        }
      }

      const evidence = extractStepEvidence(ev, snap);
      return evidence ? { ...step, evidence } : step;
    }),
  );
}
