import { createLogger } from '@flowbuddy/logger';

const log = createLogger('overlap');

/**
 * P3-M0 — workflow OVERLAP detection: "this recording covers something you already approved".
 *
 * Recording the same task twice is a normal operating condition, not an edge case — step
 * granularity is a model judgment made during distillation, so a re-recording can produce a second
 * telling of one task without the product having changed at all. Left undetected, both tellings get
 * approved, both rank high for the same question, and they split the answer's candidate budget
 * between two versions of one thing. Decisions + the measured evidence: `docs/build/workflow-identity.md`.
 *
 * HOW — TWO signals, and a pair must satisfy BOTH:
 *   1. the MEAN of a workflow's step embeddings ("is this broadly the same material?")
 *   2. the LAST step's embedding ("does it END in the same place?")
 * Both reuse the vectors hybrid retrieval already writes at KB build, so detection costs no model
 * call — only arithmetic in Postgres.
 *
 * WHY THE LAST STEP DECIDES. A workflow's identity is its DESTINATION, not its journey. Two routes
 * to billing are the same task; two journeys that begin identically and end somewhere different are
 * not. Averaging actively destroys this, because shared navigation boilerplate ("Click Home") is a
 * large fraction of a short workflow. Measured on a real KB: "View analytics" and "View billing"
 * both open with "Click Home", scoring the HIGHEST first-step similarity of any pair (0.870) and
 * clearing the centroid gate at 0.757 — a false positive. On their last steps they collapse to
 * 0.443. Across the same set the centroid separated true duplicates from false ones by 0.054; the
 * last step separated them by 0.280. Do not "simplify" this back to a single averaged score.
 *
 * WHEN: on demand, never cached. What counts as a duplicate depends on what is approved *right
 * now*, and that changes as the founder works — a fingerprint computed at KB build would be stale
 * the moment anything else was approved.
 *
 * SIMILARITY_THRESHOLD = 0.72 (centroid) — the RECALL gate: cheap, generous, and deliberately not
 * decisive. Every workflow in one product shares its vocabulary and UI nouns, so unrelated content
 * does NOT sit near zero — the nearest unrelated pair measured 0.61. Do not lower this toward 0.6,
 * which is the noise floor for same-product content rather than a safe margin.
 *
 * LAST_STEP_THRESHOLD = 0.60 — the PRECISION gate, and the one that does the real work. Measured
 * true duplicates scored 0.723 and 0.842; the false positive scored 0.443 and the next-nearest
 * unrelated pair 0.469. 0.60 sits ~0.12 clear of the lowest true positive and ~0.13 clear of the
 * highest false one. It is the better-founded of the two constants despite being the newer.
 *
 * Both are still provisional: this is calibrated on two true duplicates and a handful of negatives
 * from ONE product. Neither number should be treated as settled until a known VARIANT pair (same
 * goal, genuinely different route) has been measured — that is the case predicted to stress the
 * last-step gate hardest, since two real routes to one destination should end alike but need not.
 *
 * ADVISORY, NEVER BLOCKING: every failure path returns `[]`. Detection informs a founder's choice —
 * it must never be able to stop a workflow being approved.
 *
 * SAME-RECORDING PAIRS COUNT TOO. This originally compared across recordings only, on the reasoning
 * that two near-identical workflows inside ONE recording could only mean the segmenter over-split a
 * task, which supersession cannot fix. That reasoning missed the commonest way a duplicate is made
 * at all: **doing the task twice while recording** — fumbling it and starting over, or re-running it
 * for a cleaner take. The segmenter correctly emits two workflows, and they are duplicates in
 * exactly the sense this exists for. Excluding them hid the button that already fixed them, since
 * supersession works on any two workflows regardless of where they came from.
 *
 * The over-split case is left to the gates rather than to a blanket exclusion: two FRAGMENTS of one
 * workflow end in different places, so they fail the destination gate — the same signal that
 * rejected two unrelated tasks sharing their opening navigation. Anything that still slips through
 * is a false positive, and there is now a consequence-free "not duplicates" for exactly that.
 */

export const SIMILARITY_THRESHOLD = 0.72;
export const LAST_STEP_THRESHOLD = 0.6;

/** Hard cap on pairs returned — a review screen showing more than this is not a review screen. */
const MAX_PAIRS = 50;

export interface WorkflowRef {
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string | null;
}

/** One suspected duplicate. `a`/`b` are in canonical key order — callers decide which to show as the incumbent. */
export interface OverlapPair {
  a: WorkflowRef;
  b: WorkflowRef;
  /** Centroid agreement — "broadly the same material". */
  similarity: number;
  /** Last-step agreement — "ends in the same place". The discriminating signal. */
  goalSimilarity: number;
}

/** The slice of the Prisma client this needs — `prisma` satisfies it structurally. */
export interface OverlapDb {
  $queryRaw?<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface FindOverlapsOpts {
  /** `"sourceId:segmentIndex"` keys on one side of the comparison (e.g. a recording's candidates). */
  leftKeys: string[];
  /** `"sourceId:segmentIndex"` keys on the other side (e.g. everything already approved). */
  rightKeys: string[];
  /** Centroid gate — defaults to `SIMILARITY_THRESHOLD`. */
  threshold?: number;
  /** Destination gate — defaults to `LAST_STEP_THRESHOLD`. */
  lastStepThreshold?: number;
}

interface PairRow {
  a_sid: string;
  a_seg: number;
  a_title: string | null;
  b_sid: string;
  b_seg: number;
  b_title: string | null;
  similarity: number;
  goal_similarity: number;
}

export const workflowKey = (sourceId: string, segmentIndex: number) => `${sourceId}:${segmentIndex}`;

/**
 * Suspected duplicates between two sets of workflows in one workspace, strongest first.
 *
 * Pass the same array as both sides to sweep an entire approved KB against itself (the surface that
 * catches duplicates which were BOTH approved before detection existed — the common case on day one,
 * since approval-time detection can only ever catch what arrives after it).
 */
export async function findWorkflowOverlaps(
  db: OverlapDb,
  workspaceId: string,
  opts: FindOverlapsOpts,
): Promise<OverlapPair[]> {
  const {
    leftKeys,
    rightKeys,
    threshold = SIMILARITY_THRESHOLD,
    lastStepThreshold = LAST_STEP_THRESHOLD,
  } = opts;
  if (!db.$queryRaw || leftKeys.length === 0 || rightKeys.length === 0) return [];

  try {
    const rows = await db.$queryRaw<PairRow[]>`
      WITH wf AS (
        SELECT "sourceId" AS sid,
               "segmentIndex" AS seg,
               MIN("segmentTitle") AS title,
               AVG(embedding) AS centroid
        FROM "KnowledgeItem"
        WHERE "workspaceId" = ${workspaceId}
          AND embedding IS NOT NULL
          AND "segmentIndex" IS NOT NULL
        GROUP BY "sourceId", "segmentIndex"
      ),
      -- Where each workflow ENDS. This is the signal that tells two tasks apart when they happen to
      -- start with the same navigation.
      last_step AS (
        SELECT DISTINCT ON ("sourceId", "segmentIndex")
               "sourceId" AS sid, "segmentIndex" AS seg, embedding AS goal
        FROM "KnowledgeItem"
        WHERE "workspaceId" = ${workspaceId}
          AND embedding IS NOT NULL
          AND "segmentIndex" IS NOT NULL
        ORDER BY "sourceId", "segmentIndex", "orderIndex" DESC
      ),
      pairs AS (
        SELECT a.sid AS a_sid, a.seg AS a_seg, a.title AS a_title,
               b.sid AS b_sid, b.seg AS b_seg, b.title AS b_title,
               1 - (a.centroid <=> b.centroid) AS similarity,
               1 - (la.goal <=> lb.goal) AS goal_similarity
        FROM wf a
        JOIN wf b
          -- Canonical ordering alone: it stops a workflow pairing with itself and stops a pair
          -- appearing twice. There is deliberately NO same-recording exclusion here -- two
          -- workflows from ONE recording can be genuine duplicates (see the header).
          ON (a.sid || ':' || a.seg::text) < (b.sid || ':' || b.seg::text)
        JOIN last_step la ON la.sid = a.sid AND la.seg = a.seg
        JOIN last_step lb ON lb.sid = b.sid AND lb.seg = b.seg
        WHERE (
                (a.sid || ':' || a.seg::text) = ANY(${leftKeys}::text[])
            AND (b.sid || ':' || b.seg::text) = ANY(${rightKeys}::text[])
              )
           OR (
                (a.sid || ':' || a.seg::text) = ANY(${rightKeys}::text[])
            AND (b.sid || ':' || b.seg::text) = ANY(${leftKeys}::text[])
              )
      )
      SELECT * FROM pairs
      WHERE similarity >= ${threshold}
        AND goal_similarity >= ${lastStepThreshold}
      ORDER BY similarity DESC
      LIMIT ${MAX_PAIRS}`;

    return rows.map((r) => ({
      a: { sourceId: r.a_sid, segmentIndex: r.a_seg, segmentTitle: r.a_title },
      b: { sourceId: r.b_sid, segmentIndex: r.b_seg, segmentTitle: r.b_title },
      similarity: Number(r.similarity),
      goalSimilarity: Number(r.goal_similarity),
    }));
  } catch (e) {
    // Advisory by design: a workspace whose vectors are missing or whose DB rejects the scan simply
    // sees no duplicate warnings, and approval proceeds exactly as it did before this existed.
    log.warn(
      { workspaceId, err: e instanceof Error ? e.message : String(e) },
      'overlap detection unavailable — no duplicate warnings this pass',
    );
    return [];
  }
}

// ── Identity matching across a reprocess ───────────────────────────────────────────────────────────

/** A workflow reduced to the two vectors identity is decided on. */
export interface WorkflowFingerprint<K> {
  key: K;
  /** Mean of the workflow's step embeddings. */
  centroid: number[];
  /** The LAST step's embedding — where the workflow ends, and what actually distinguishes it. */
  goal: number[];
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Mean of a set of vectors — a workflow's centroid. Returns `null` for an empty set. */
export function meanVector(vectors: number[][]): number[] | null {
  const usable = vectors.filter((v) => v.length > 0);
  const first = usable[0];
  if (!first) return null;
  const out = new Array<number>(first.length).fill(0);
  for (const v of usable) {
    if (v.length !== out.length) continue;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (v[i] as number);
  }
  return out.map((x) => x / usable.length);
}

/**
 * Decide which freshly-distilled workflows ARE which existing ones — the operation that lets an
 * approval survive a reprocess without following a position.
 *
 * **This is the whole point of durable identity.** A re-segmentation can split a recording
 * differently, so the workflow at position 2 afterwards need not be the workflow that was at
 * position 2 before. Reusing an identity by position hands the founder's approval — the product's
 * trust boundary — to content nobody reviewed. Matching on content means the identity, and the
 * approval with it, follows EVIDENCE.
 *
 * Same two gates as duplicate detection, for the same reason: broad similarity alone lets shared
 * navigation outvote the goal.
 *
 * **Unmatched in either direction is meaningful, and both directions fail closed.** An incoming
 * workflow with no match is genuinely new (born unapproved). An existing identity with no match has
 * lost its content, so its approval can no longer be trusted and must stop answering.
 *
 * Greedy best-first, one-to-one: with a handful of workflows per recording an optimal assignment
 * would cost more to explain than it could ever buy.
 */
export function matchWorkflowIdentities<I, E>(
  incoming: WorkflowFingerprint<I>[],
  existing: WorkflowFingerprint<E>[],
  opts: { threshold?: number; lastStepThreshold?: number } = {},
): Map<I, E> {
  const threshold = opts.threshold ?? SIMILARITY_THRESHOLD;
  const goalThreshold = opts.lastStepThreshold ?? LAST_STEP_THRESHOLD;

  const scored: Array<{ i: I; e: E; score: number }> = [];
  for (const a of incoming) {
    for (const b of existing) {
      const sim = cosine(a.centroid, b.centroid);
      const goal = cosine(a.goal, b.goal);
      if (sim < threshold || goal < goalThreshold) continue;
      // Rank on the goal first: it is the discriminating signal, so when two candidates both clear
      // the gates the one that ends in the same place is the better identity claim.
      scored.push({ i: a.key, e: b.key, score: goal * 2 + sim });
    }
  }
  scored.sort((x, y) => y.score - x.score);

  const out = new Map<I, E>();
  const takenExisting = new Set<E>();
  for (const { i, e, score: _score } of scored) {
    if (out.has(i) || takenExisting.has(e)) continue;
    out.set(i, e);
    takenExisting.add(e);
  }
  return out;
}

/**
 * Canonical pair ordering for the "keep both" memo, so one pair can never be stored twice under two
 * orderings. Mirrors the SQL's `a < b` on the composite key.
 */
export function canonicalPair(
  x: { sourceId: string; segmentIndex: number },
  y: { sourceId: string; segmentIndex: number },
): { a: { sourceId: string; segmentIndex: number }; b: { sourceId: string; segmentIndex: number } } {
  return workflowKey(x.sourceId, x.segmentIndex) < workflowKey(y.sourceId, y.segmentIndex)
    ? { a: x, b: y }
    : { a: y, b: x };
}
