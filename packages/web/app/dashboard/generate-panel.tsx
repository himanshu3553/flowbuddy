// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateArticles } from '@/lib/generate-actions';

export interface PanelCandidate {
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  generatedArticleId: string | null;
}

/** Curated "Auto Generate Articles" picker for ONE recording: check un-generated workflow
 *  candidates → generate only those (synchronous). Generated candidates link to their article. */
export function GeneratePanel({ sourceId, candidates }: { sourceId: string; candidates: PanelCandidate[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const ungenerated = candidates.filter((c) => !c.generatedArticleId);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function run() {
    if (selected.size === 0) return;
    setError(null);
    const segmentIndexes = [...selected];
    start(async () => {
      try {
        await generateArticles({ sourceId, segmentIndexes });
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    });
  }

  return (
    <div>
      <ul className="list">
        {candidates.map((c) => (
          <li key={c.segmentIndex}>
            {c.generatedArticleId ? (
              <>
                <span className="pill pill-done">✓ generated</span>
                <Link className="grow" href={`/dashboard/articles/${c.generatedArticleId}`}>{c.segmentTitle}</Link>
              </>
            ) : (
              <>
                <input
                  type="checkbox"
                  checked={selected.has(c.segmentIndex)}
                  onChange={() => toggle(c.segmentIndex)}
                  disabled={pending}
                  aria-label={`Select ${c.segmentTitle}`}
                />
                <span className="grow">{c.segmentTitle}</span>
              </>
            )}
            <span className="muted">{c.itemCount} steps</span>
          </li>
        ))}
      </ul>
      {ungenerated.length > 0 && (
        <div className="row" style={{ gap: 12, marginTop: 10, alignItems: 'center' }}>
          <button type="button" onClick={run} disabled={pending || selected.size === 0}>
            {pending ? 'Generating…' : `Generate selected${selected.size ? ` (${selected.size})` : ''}`}
          </button>
          {pending && <span className="muted">Synthesizing from the recording — this can take a minute.</span>}
          {error && <span className="rationale" style={{ color: 'crimson' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
