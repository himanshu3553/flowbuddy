'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateFromPrompt, type PromptResult } from '@/lib/prompt-actions';

/** Module 3.2 — "Generate from a prompt": type a topic, get a grounded draft article from the
 *  whole-workspace KB, or a decline (logged as a coverage gap). */
export function PromptBox() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    const topic = prompt.trim();
    if (!topic) return;
    setError(null);
    setResult(null);
    start(async () => {
      try {
        const r = await generateFromPrompt(topic);
        setResult(r);
        if (r.ok) setPrompt('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    });
  }

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          className="grow"
          placeholder='e.g. "How do I create a new project?"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          disabled={pending}
        />
        <button type="button" onClick={run} disabled={pending || !prompt.trim()}>
          {pending ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {pending && <p className="muted" style={{ marginTop: 8 }}>Searching your recordings and assembling — this can take a minute.</p>}
      {error && <p className="rationale" style={{ color: 'crimson', marginTop: 8 }}>{error}</p>}
      {result?.ok && (
        <p style={{ marginTop: 8 }}>
          ✓ Created <Link href={`/dashboard/articles/${result.articleId}`}>{result.title}</Link> (draft).
        </p>
      )}
      {result && !result.ok && (
        <p className="rationale" style={{ marginTop: 8 }}>
          ⚠ Declined — not covered by your recordings: <em>{result.reason}</em> Logged as a coverage gap below (“record this next”).
        </p>
      )}
    </div>
  );
}
