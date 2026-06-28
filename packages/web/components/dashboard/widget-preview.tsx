import { Bot } from 'lucide-react';

/**
 * Static preview of the embeddable end-user copilot (the widget runtime is a
 * separate deliverable). Shows a grounded answer with a citation chip and an
 * honest decline — the trust story, as it appears inside a customer's app.
 */
export function WidgetPreview() {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
        End-user preview — in your app
      </div>
      <div className="rounded-[14px] border border-[#e7eafb] bg-[#f4f6fd] p-4">
        <div className="overflow-hidden rounded-[14px] border border-[color:var(--media-border)] bg-white shadow-widget">
          {/* widget header */}
          <div className="flex items-center gap-2.5 border-b px-3.5 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold leading-tight text-ink">
                Copilot
              </span>
              <span className="block font-mono text-[10px] text-faint">
                grounded in your approved docs
              </span>
            </span>
            <span className="text-faint">×</span>
          </div>

          {/* conversation */}
          <div className="flex flex-col gap-2.5 bg-[#fcfcfd] px-3.5 py-3.5">
            <div className="ml-auto w-fit max-w-[78%] rounded-[13px] rounded-br-[4px] bg-primary px-3 py-2 text-xs text-primary-foreground">
              How do I reset a customer’s password?
            </div>
            <div className="w-fit max-w-[88%] rounded-[13px] rounded-bl-[4px] border bg-white px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
              Open the account menu, go to <b>Security</b>, then click{' '}
              <b>Reset password</b> and confirm. They’ll get a reset email.
              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-[3px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="font-mono text-[10px] text-primary">
                    Source: Reset a password
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-2 text-[13px] leading-none">
                  <span className="text-success-dot">▲</span>
                  <span className="text-[color:var(--gray-300)]">▽</span>
                </span>
              </div>
            </div>

            <div className="ml-auto w-fit max-w-[78%] rounded-[13px] rounded-br-[4px] bg-primary px-3 py-2 text-xs text-primary-foreground">
              Do you support SAML SSO?
            </div>
            <div className="w-fit max-w-[88%] rounded-[13px] rounded-bl-[4px] border border-danger-border bg-white px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
              I don’t have that in my approved sources yet, so I won’t guess. I’ve
              flagged it for your team to cover.
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill border border-danger-border bg-danger-bg px-2.5 py-[3px]">
                <span className="h-1.5 w-1.5 rounded-full bg-danger-ink" />
                <span className="font-mono text-[10px] text-danger-text">
                  Honest decline · gap logged
                </span>
              </div>
            </div>
          </div>

          {/* input */}
          <div className="flex items-center gap-2 border-t px-3 py-2.5">
            <span className="flex-1 text-xs text-[color:var(--gray-300)]">
              Ask anything…
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              ↑
            </span>
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-[#8b93b4]">
          context-aware · cites sources · declines honestly
        </p>
      </div>
    </div>
  );
}
