'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, ArrowUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { previewCopilotAnswer } from '@/lib/copilot-preview-actions';

/**
 * Live, in-Studio copilot preview. Renders the embeddable copilot's chrome (so it looks like what
 * end-users see) but answers through a session-authenticated server action that reuses the real
 * grounding engine — no embed, no public key, and questions stay out of analytics/coverage gaps.
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

function citationTitles(citations?: Citation[]): string[] {
  return [...new Set((citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
}

export function WidgetPreview() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const base = messages;
    setMessages([...base, { role: 'user', content: q }]);
    setLoading(true);

    const history = base.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await previewCopilotAnswer(q, history);
      const reply: Msg = res.covered
        ? { role: 'assistant', content: res.answer ?? '', citations: res.citations }
        : res.error
          ? { role: 'assistant', content: res.reason ?? 'Something went wrong.', error: true }
          : { role: 'assistant', content: res.reason ?? "I don’t have that in our help content yet.", decline: true };
      setMessages((cur) => [...cur, reply]);
    } catch {
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: 'Could not reach the copilot. Please try again.', error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
        Copilot Preview
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
                How can I help you today?
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
          live · grounded in approved KB · not logged to analytics
        </p>
      </div>
    </div>
  );
}
