'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, ArrowUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { previewCopilotAnswer } from '@/lib/copilot-preview-actions';

/**
 * Live, in-Studio copilot tester (Approach A). Renders the embeddable copilot's chrome (so it looks
 * like what end-users see) but answers through a session-authenticated server action that reuses the
 * real grounding engine — no embed, no public key, and test questions stay out of analytics.
 *
 * Two modes: "Demo" seeds a canned grounded-answer + honest-decline (the trust story at a glance);
 * "Test live" runs the user's own questions against their approved workflows.
 */

interface Citation {
  segmentTitle: string | null;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  decline?: boolean;
  error?: boolean;
}

// Canned conversation shown in Demo mode — a grounded answer (with a source) and an honest decline.
const DEMO: Msg[] = [
  { role: 'user', content: 'How do I reset a customer’s password?' },
  {
    role: 'assistant',
    content:
      'Open the account menu, go to Security, then click Reset password and confirm. They’ll get a reset email.',
    citations: [{ segmentTitle: 'Reset a password' }],
  },
  { role: 'user', content: 'Do you support SAML SSO?' },
  {
    role: 'assistant',
    content:
      'I don’t have that in my approved sources yet, so I won’t guess. I’ve flagged it for your team to cover.',
    decline: true,
  },
];

function citationTitles(citations?: Citation[]): string[] {
  return [...new Set((citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
}

export function WidgetPreview() {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [liveMsgs, setLiveMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = mode === 'demo' ? DEMO : liveMsgs;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    // First question from Demo mode starts a fresh live conversation (don't carry canned turns in).
    const base = mode === 'demo' ? [] : liveMsgs;
    if (mode === 'demo') setMode('live');
    setLiveMsgs([...base, { role: 'user', content: q }]);
    setLoading(true);

    const history = base.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await previewCopilotAnswer(q, history);
      const reply: Msg = res.covered
        ? { role: 'assistant', content: res.answer ?? '', citations: res.citations }
        : { role: 'assistant', content: res.reason ?? "I don’t have that in our help content yet.", decline: true };
      setLiveMsgs((cur) => [...cur, reply]);
    } catch {
      setLiveMsgs((cur) => [
        ...cur,
        { role: 'assistant', content: 'Could not reach the copilot. Please try again.', error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
          End-user preview — in your app
        </span>
        <div className="flex items-center gap-0.5 rounded-full border bg-secondary p-0.5">
          {(['demo', 'live'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'demo' ? 'Demo' : 'Test live'}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[14px] border border-[#e7eafb] bg-[#f4f6fd] p-4">
        <div className="overflow-hidden rounded-[14px] border border-[color:var(--media-border)] bg-white shadow-widget">
          {/* widget header */}
          <div className="flex items-center gap-2.5 border-b bg-primary px-3.5 py-3 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
              <Bot className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold leading-tight">Copilot</span>
              <span className="block font-mono text-[10px] text-white/70">
                grounded in your approved docs
              </span>
            </span>
            <span className="text-white/70">×</span>
          </div>

          {/* conversation */}
          <div
            ref={scrollRef}
            className="flex h-[300px] flex-col gap-2.5 overflow-y-auto bg-[#fcfcfd] px-3.5 py-3.5"
          >
            {messages.length === 0 && !loading ? (
              <p className="m-auto px-6 text-center text-xs text-faint">
                Hi! Ask me anything about this product — I answer only from your approved workflows.
              </p>
            ) : (
              messages.map((m, i) =>
                m.role === 'user' ? (
                  <div
                    key={i}
                    className="ml-auto w-fit max-w-[78%] whitespace-pre-wrap break-words rounded-[13px] rounded-br-[4px] bg-primary px-3 py-2 text-xs text-primary-foreground"
                  >
                    {m.content}
                  </div>
                ) : (
                  <div
                    key={i}
                    className={cn(
                      'w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-[13px] rounded-bl-[4px] border bg-white px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground',
                      (m.decline || m.error) && 'border-danger-border',
                    )}
                  >
                    {m.content}
                    {!m.decline && !m.error && citationTitles(m.citations).length > 0 && (
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-[3px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <span className="font-mono text-[10px] text-primary">
                            Source: {citationTitles(m.citations).join(' · ')}
                          </span>
                        </span>
                      </div>
                    )}
                    {m.decline && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill border border-danger-border bg-danger-bg px-2.5 py-[3px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-danger-ink" />
                        <span className="font-mono text-[10px] text-danger-text">Honest decline</span>
                      </div>
                    )}
                  </div>
                ),
              )
            )}
            {loading && (
              <div className="w-fit max-w-[88%] rounded-[13px] rounded-bl-[4px] border bg-white px-3 py-2.5 text-xs tracking-[2px] text-faint">
                …
              </div>
            )}
          </div>

          {/* input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder="Ask anything…"
              className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-[color:var(--gray-300)] disabled:opacity-60"
              aria-label="Ask the copilot a question"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-[#8b93b4]">
          {mode === 'live'
            ? 'live · grounded in approved KB · not logged to analytics'
            : 'context-aware · cites sources · declines honestly'}
        </p>
      </div>
    </div>
  );
}
