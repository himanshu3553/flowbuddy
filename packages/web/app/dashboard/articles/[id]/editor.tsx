// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Highlight } from '@sync/shared';
import * as actions from '@/lib/article-actions';

export interface EditorStep {
  id: string;
  instruction: string;
  rationale: string;
  selector: string;
  route: string;
  expectedOutcome: string;
  uncertain: boolean;
  highlight: Highlight | null;
  screenshotUrl: string | null;
}

export interface EditorArticle {
  id: string;
  title: string;
  intent: string;
  status: 'draft' | 'published';
  tags: string[];
  routes: string[];
  steps: EditorStep[];
}

export function ArticleEditor({ article }: { article: EditorArticle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(article.title);
  const published = article.status === 'published';

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <main style={{ maxWidth: 760 }}>
      <p className="muted"><Link href="/dashboard">← Studio</Link></p>

      <div className="card">
        <label className="muted" htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            disabled={pending || title === article.title}
            onClick={() => run(() => actions.updateArticleTitle(article.id, title))}
          >
            Save title
          </button>
          <button
            className={published ? 'secondary' : ''}
            disabled={pending}
            onClick={() => run(() => actions.setArticleStatus(article.id, published ? 'draft' : 'published'))}
          >
            {published ? 'Unpublish' : 'Publish'}
          </button>
          <span className={`pill pill-${article.status}`} style={{ alignSelf: 'center' }}>{article.status}</span>
        </div>
        {article.intent && <p className="muted" style={{ marginTop: 10 }}>{article.intent}</p>}
        {article.tags.length > 0 && (
          <p className="tags">{article.tags.map((t) => <span key={t}>{t}</span>)}</p>
        )}
      </div>

      <h2 style={{ fontSize: 15 }}>Steps ({article.steps.length})</h2>
      {article.steps.map((s, i) => (
        <StepRow key={s.id} step={s} index={i} total={article.steps.length} pending={pending} run={run} />
      ))}
    </main>
  );
}

function StepRow({
  step,
  index,
  total,
  pending,
  run,
}: {
  step: EditorStep;
  index: number;
  total: number;
  pending: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const [instruction, setInstruction] = useState(step.instruction);
  const [rationale, setRationale] = useState(step.rationale);
  const dirty = instruction !== step.instruction || rationale !== step.rationale;

  return (
    <div className="card step-card">
      <div className="step-main">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            Step {index + 1}
            {step.uncertain && <span className="badge">uncertain</span>}
          </strong>
          <span>
            <button className="mini" disabled={pending || index === 0} onClick={() => run(() => actions.moveStep(step.id, 'up'))}>↑</button>
            <button className="mini" disabled={pending || index === total - 1} onClick={() => run(() => actions.moveStep(step.id, 'down'))}>↓</button>
            <button className="mini danger" disabled={pending} onClick={() => run(() => actions.deleteStep(step.id))}>✕</button>
          </span>
        </div>
        <label className="muted">Instruction</label>
        <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <label className="muted">Rationale</label>
        <textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        {step.expectedOutcome && <p className="outcome">→ {step.expectedOutcome}</p>}
        {step.selector && <p className="selector"><code>{step.selector}</code></p>}
        <button disabled={pending || !dirty} onClick={() => run(() => actions.updateStep(step.id, { instruction, rationale }))}>
          Save step
        </button>
      </div>
      {step.screenshotUrl && (
        <a className="thumb" href={step.screenshotUrl} target="_blank" rel="noreferrer">
          <span className="shot-frame">
            {/* signed URL from object storage; plain img is fine */}
            <img src={step.screenshotUrl} alt={`step ${index + 1}`} />
            {step.highlight && (
              <span
                className="hl"
                style={{
                  left: `${step.highlight.x * 100}%`,
                  top: `${step.highlight.y * 100}%`,
                  width: `${step.highlight.w * 100}%`,
                  height: `${step.highlight.h * 100}%`,
                }}
              />
            )}
          </span>
        </a>
      )}
    </div>
  );
}
