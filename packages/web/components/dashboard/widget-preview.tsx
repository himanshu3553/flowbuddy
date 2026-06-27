import { Bot, ThumbsDown, ThumbsUp } from 'lucide-react';

/**
 * Static preview of the embeddable end-user copilot (the widget runtime is a
 * separate deliverable). Shows a grounded answer with a citation chip and an
 * honest decline — the trust story, as it appears inside a customer's app.
 */
export function WidgetPreview() {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        End-user preview — in your app
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* widget header */}
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#4a63e8] to-[#3a50dd] text-white">
            <Bot className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">
              Copilot
            </span>
            <span className="block text-[10.5px] text-muted-foreground">
              grounded in your approved docs
            </span>
          </span>
          <span className="text-muted-foreground">×</span>
        </div>

        {/* conversation */}
        <div className="space-y-3 px-4 py-4">
          <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
            How do I reset a customer’s password?
          </div>
          <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-xs leading-relaxed">
            Open the account menu, go to <b>Security</b>, then click{' '}
            <b>Reset password</b> and confirm. They’ll get a reset email.
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Source: Reset a password
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />
                <ThumbsDown className="h-3 w-3" />
              </span>
            </div>
          </div>

          <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
            Do you support SAML SSO?
          </div>
          <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm border border-dashed bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            I don’t have that in my approved sources yet, so I won’t guess. I’ve
            flagged it for your team to cover.
            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              Honest decline · gap logged
            </div>
          </div>
        </div>

        {/* input */}
        <div className="border-t px-4 py-3">
          <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Ask anything…
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              ↑
            </span>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        context-aware · cites sources · declines honestly
      </p>
    </div>
  );
}
