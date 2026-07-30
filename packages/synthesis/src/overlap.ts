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
 * Cross-recording ONLY. Two near-identical workflows inside ONE recording are a segmentation
 * problem, not a duplicate-recording problem, and pairing them here would send the founder to a
 * screen whose choices ("this replaces the old one") cannot fix it.
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
          ON a.sid <> b.sid
         AND (a.sid || ':' || a.seg::text) < (b.sid || ':' || b.seg::text)
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
