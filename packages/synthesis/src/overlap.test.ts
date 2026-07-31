import { describe, expect, it, vi } from 'vitest';
import {
  canonicalPair,
  findWorkflowOverlaps,
  matchWorkflowIdentities,
  meanVector,
  workflowKey,
  SIMILARITY_THRESHOLD,
  LAST_STEP_THRESHOLD,
  type OverlapDb,
} from './overlap';
import { retrieveApprovedKBItems, type RetrievalDb } from './retrieval';

/**
 * P3-M0 — duplicate-workflow detection, and the supersession filter that hangs off it.
 *
 * WHY THESE. Two things here can fail silently and expensively:
 *  1. Detection throwing instead of degrading — it runs on the approval screen, so an exception
 *     would block the founder from approving anything at all. It is advisory; it must always
 *     return a list, never raise.
 *  2. Retrieval forgetting `inactiveReason: null` — a retired workflow would keep answering
 *     end-users with content the founder replaced, or that a reprocess could not verify, and
 *     NOTHING would look broken. That filter is the entire enforcement surface, so it is pinned.
 *  3. Identity matching accepting a workflow that ends somewhere else — that is how an approval
 *     walks onto content nobody reviewed, which is the failure this whole module exists to stop.
 */

const row = (
  aSid: string,
  aSeg: number,
  bSid: string,
  bSeg: number,
  similarity: number,
  goalSimilarity = 0.8,
) => ({
  a_sid: aSid,
  a_seg: aSeg,
  a_title: 'Create an account',
  b_sid: bSid,
  b_seg: bSeg,
  b_title: 'Create a new account',
  similarity,
  goal_similarity: goalSimilarity,
});

const dbReturning = (rows: unknown[]): OverlapDb => ({
  $queryRaw: vi.fn().mockResolvedValue(rows) as unknown as OverlapDb['$queryRaw'],
});

describe('findWorkflowOverlaps', () => {
  it('maps rows into pairs, strongest first', async () => {
    const db = dbReturning([row('src-a', 0, 'src-b', 0, 0.81)]);
    const out = await findWorkflowOverlaps(db, 'ws-1', { leftKeys: ['src-b:0'], rightKeys: ['src-a:0'] });
    expect(out).toHaveLength(1);
    const [first] = out;
    expect(first?.a).toEqual({ sourceId: 'src-a', segmentIndex: 0, segmentTitle: 'Create an account' });
    expect(first?.b.sourceId).toBe('src-b');
    expect(first?.similarity).toBeCloseTo(0.81);
  });

  it('degrades to an empty list when the scan fails — never throws', async () => {
    const db: OverlapDb = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('no pgvector')) as unknown as OverlapDb['$queryRaw'],
    };
    await expect(findWorkflowOverlaps(db, 'ws-1', { leftKeys: ['a:0'], rightKeys: ['b:0'] })).resolves.toEqual(
      [],
    );
  });

  it('degrades when the client cannot run raw SQL at all', async () => {
    await expect(findWorkflowOverlaps({}, 'ws-1', { leftKeys: ['a:0'], rightKeys: ['b:0'] })).resolves.toEqual(
      [],
    );
  });

  it('does not query when either side is empty', async () => {
    const db = dbReturning([]);
    await findWorkflowOverlaps(db, 'ws-1', { leftKeys: [], rightKeys: ['b:0'] });
    await findWorkflowOverlaps(db, 'ws-1', { leftKeys: ['a:0'], rightKeys: [] });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports both signals, so a caller can see WHY a pair was flagged', async () => {
    const db = dbReturning([row('src-a', 0, 'src-b', 0, 0.83, 0.84)]);
    const [pair] = await findWorkflowOverlaps(db, 'ws-1', { leftKeys: ['src-b:0'], rightKeys: ['src-a:0'] });
    expect(pair?.similarity).toBeCloseTo(0.83);
    expect(pair?.goalSimilarity).toBeCloseTo(0.84);
  });

  it('keeps the centroid gate above the same-product noise floor', () => {
    // Workflows in one product share vocabulary, so unrelated pairs sit around 0.61 — not near zero.
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0.65);
    expect(SIMILARITY_THRESHOLD).toBeLessThan(0.81);
  });

  it('keeps the destination gate between the measured false and true positives', () => {
    // The gate that actually does the work. Measured: true duplicates ended at 0.723 / 0.842; the
    // "View analytics vs View billing" false positive ended at 0.443, and the next-nearest
    // unrelated pair at 0.469. Anything outside this band re-admits that false positive or starts
    // dropping real duplicates.
    expect(LAST_STEP_THRESHOLD).toBeGreaterThan(0.47);
    expect(LAST_STEP_THRESHOLD).toBeLessThan(0.72);
  });

  it('separates true from false better on the destination than on the centroid', () => {
    // The reason the second signal exists, kept executable: on real data the centroid separated
    // true duplicates from the false positive by 0.054 (0.811 vs 0.757) while the last step
    // separated them by 0.280 (0.723 vs 0.443). A future "one score is simpler" refactor should
    // have to delete this test on purpose.
    const centroidMargin = 0.811 - 0.757;
    const destinationMargin = 0.723 - 0.443;
    expect(destinationMargin).toBeGreaterThan(centroidMargin * 4);
  });
});

describe('canonicalPair', () => {
  it('orders a pair identically whichever way it is passed', () => {
    const x = { sourceId: 'src-b', segmentIndex: 1 };
    const y = { sourceId: 'src-a', segmentIndex: 4 };
    expect(canonicalPair(x, y)).toEqual(canonicalPair(y, x));
    expect(canonicalPair(x, y).a).toEqual(y);
  });

  it('separates segments within one recording', () => {
    const a = { sourceId: 'src-a', segmentIndex: 1 };
    const b = { sourceId: 'src-a', segmentIndex: 2 };
    expect(workflowKey(a.sourceId, a.segmentIndex)).not.toBe(workflowKey(b.sourceId, b.segmentIndex));
    expect(canonicalPair(a, b).a).toEqual(a);
  });
});

describe('matchWorkflowIdentities — surviving a reprocess', () => {
  // Vectors chosen so cosine is obvious: [1,0,0] vs [1,0,0] = 1, vs [0,1,0] = 0.
  const HERE = [1, 0, 0];
  const ELSEWHERE = [0, 1, 0];

  it('keeps an identity when the content still matches', () => {
    const out = matchWorkflowIdentities(
      [{ key: 0, centroid: HERE, goal: HERE }],
      [{ key: 'wf-1', centroid: HERE, goal: HERE }],
    );
    expect(out.get(0)).toBe('wf-1');
  });

  it('REFUSES a match whose destination differs, even when the material is identical', () => {
    // The case the whole design turns on. Two workflows can share almost every step and still be
    // different tasks; handing one the other's identity would hand it the founder's approval.
    const out = matchWorkflowIdentities(
      [{ key: 0, centroid: HERE, goal: HERE }],
      [{ key: 'wf-1', centroid: HERE, goal: ELSEWHERE }],
    );
    expect(out.size).toBe(0);
  });

  it('leaves a genuinely new workflow unmatched — it must be born unapproved', () => {
    const out = matchWorkflowIdentities(
      [{ key: 0, centroid: ELSEWHERE, goal: ELSEWHERE }],
      [{ key: 'wf-1', centroid: HERE, goal: HERE }],
    );
    expect(out.has(0)).toBe(false);
  });

  it('never gives one identity to two workflows', () => {
    // Both incoming clear the gates against the same existing workflow. Only one may take it —
    // otherwise a single approval would end up covering two different sets of steps.
    const out = matchWorkflowIdentities(
      [
        { key: 0, centroid: HERE, goal: HERE },
        { key: 1, centroid: HERE, goal: HERE },
      ],
      [{ key: 'wf-1', centroid: HERE, goal: HERE }],
    );
    expect(out.size).toBe(1);
    expect([...out.values()]).toEqual(['wf-1']);
  });

  it('matches nothing when there is nothing to match against', () => {
    expect(matchWorkflowIdentities([{ key: 0, centroid: HERE, goal: HERE }], []).size).toBe(0);
  });
});

describe('meanVector', () => {
  it('averages component-wise', () => {
    expect(meanVector([[0, 2], [2, 0]])).toEqual([1, 1]);
  });

  it('returns null with nothing to average — a workflow with no vectors has no fingerprint', () => {
    expect(meanVector([])).toBeNull();
  });
});

describe('the liveness test — retrieval enforcement surface', () => {
  /** Captures the `where` retrieval sends, and returns no approvals (the rest of the path is inert). */
  function spyDb(): { db: RetrievalDb; seen: Array<Record<string, unknown>> } {
    const seen: Array<Record<string, unknown>> = [];
    const db = {
      copilotApproval: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          seen.push(args.where);
          return [];
        },
      },
      knowledgeItem: { findMany: async () => [] },
    } as unknown as RetrievalDb;
    return { db, seen };
  }

  it('asks only for approvals that are LIVE', async () => {
    const { db, seen } = spyDb();
    await retrieveApprovedKBItems(db, 'ws-1', 'how do I sign up?');
    expect(seen).toHaveLength(1);
    // Two invariants in one line. Retired workflows are excluded IN THE QUERY, not filtered
    // afterwards — a post-filter is one refactor away from being dropped. And there is exactly ONE
    // way to be retired (`inactiveReason`), because six readers each checking two flags is how one
    // of them ends up checking only the first.
    expect(seen[0]).toMatchObject({ workspaceId: 'ws-1', inactiveReason: null });
  });
});
