'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RefreshCw } from 'lucide-react';

import {
  setCopilotOrigins,
  regenerateCopilotKey,
} from '@/lib/copilot-settings-actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CopyButton } from '@/components/dashboard/copy-button';

type Tab = 'install' | 'settings' | 'appearance';

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-tile bg-code-bg p-3.5 font-mono text-[11.5px] leading-[1.7] text-code-fg">
      {code}
    </pre>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full',
          done
            ? 'bg-gradient-to-br from-[#1aa86a] to-[#15935a] text-white'
            : 'border-2 border-muted-foreground/40',
        )}
      >
        {done ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className={cn(done ? '' : 'text-muted-foreground')}>{label}</span>
    </li>
  );
}

export function CopilotWorkspace({
  snippet,
  publicKey,
  allowedOrigins,
  primaryOrigin,
  widgetIsPlaceholder = false,
}: {
  snippet: string;
  publicKey: string;
  allowedOrigins: string[];
  primaryOrigin: string;
  widgetIsPlaceholder?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('install');
  const [origins, setOrigins] = useState(allowedOrigins.join('\n'));
  const [cite, setCite] = useState(true);
  const [threshold, setThreshold] = useState(50);
  const [pending, start] = useTransition();
  const router = useRouter();

  function saveOrigins() {
    start(async () => {
      await setCopilotOrigins(origins);
      router.refresh();
    });
  }
  function rotate() {
    if (
      !confirm(
        'Rotate the key? The current snippet/key stops working immediately.',
      )
    )
      return;
    start(async () => {
      await regenerateCopilotKey();
      router.refresh();
    });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'install', label: 'Install' },
    { key: 'settings', label: 'Settings' },
    { key: 'appearance', label: 'Appearance' },
  ];

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center gap-[18px] border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2.5 text-[12.5px] font-semibold transition-colors',
              tab === t.key
                ? 'border-primary text-ink'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'install' && (
        <div className="space-y-5">
          <section className="rounded-card border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13.5px] font-bold text-ink">Embed snippet</h3>
                <p className="text-xs text-muted-foreground">
                  Paste once before{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    &lt;/body&gt;
                  </code>
                  . That’s the whole install.
                </p>
              </div>
              <CopyButton value={snippet} label="Copy snippet" />
            </div>
            <CodeBlock code={snippet} />
            {widgetIsPlaceholder && (
              <p className="mt-3 rounded-md border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
                The{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  src
                </code>{' '}
                points to a placeholder — it’s set once the widget is deployed.
                For local testing, load{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  packages/widget/demo/index.html
                </code>{' '}
                with this key.
              </p>
            )}
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning-dot" />
              </span>
              <p className="text-sm">
                Listening for the copilot on{' '}
                <span className="font-semibold">{primaryOrigin}</span>… not
                detected yet.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => router.refresh()}
              >
                <RefreshCw className="h-4 w-4" />
                Recheck
              </Button>
            </div>
            <ul className="mt-4 space-y-2.5">
              <ChecklistItem done label="Public key ready" />
              <ChecklistItem
                done={allowedOrigins.length > 0}
                label="Origin allowlisted"
              />
              <ChecklistItem done={false} label="Snippet pasted" />
            </ul>
          </section>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
          <section className="rounded-card border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13.5px] font-bold text-ink">Public key</h3>
                <p className="text-xs text-muted-foreground">
                  Safe to expose in your front-end. Rotate any time.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={rotate}
                disabled={pending}
              >
                <RefreshCw className="h-4 w-4" />
                Rotate key
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="block flex-1 break-all rounded-control border bg-secondary px-3 py-2 font-mono text-xs">
                {publicKey}
              </code>
              <CopyButton value={publicKey} variant="outline" />
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Origin allowlist</h3>
            <p className="text-xs text-muted-foreground">
              The copilot only runs on origins you list here. One per line —
              leave empty to allow any origin while testing.
            </p>
            <div className="mt-3 space-y-2">
              <Label htmlFor="origins" className="sr-only">
                Allowed origins
              </Label>
              <Textarea
                id="origins"
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
                placeholder={'https://app.yourcompany.com\nhttps://www.yourcompany.com'}
                rows={4}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={saveOrigins}
                disabled={pending}
              >
                {pending ? 'Saving…' : 'Save origins'}
              </Button>
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Grounding &amp; trust</h3>
            <div className="mt-3 divide-y">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">
                    Answer only from approved workflows
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The core grounding guarantee — always on.
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">
                    Locked on
                  </span>
                  <Switch checked disabled aria-label="Answer only from approved workflows (locked on)" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Cite the workflow used</p>
                  <p className="text-xs text-muted-foreground">
                    Show a source chip on every grounded answer.
                  </p>
                </div>
                <Switch
                  checked={cite}
                  onCheckedChange={setCite}
                  aria-label="Cite the workflow used"
                />
              </div>
              <div className="py-3 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium">Decline threshold</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {threshold < 34
                      ? 'answer more'
                      : threshold > 66
                        ? 'decline more'
                        : 'balanced'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                  aria-label="Decline threshold"
                />
                <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
                  <span>answer more</span>
                  <span>decline more (safer)</span>
                </div>
              </div>
            </div>
            <p className="mt-3 rounded-md border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
              Cite &amp; decline-threshold are a preview — they don’t persist
              yet.
            </p>
          </section>
        </div>
      )}

      {tab === 'appearance' && (
        <section className="rounded-card border bg-card p-8 text-center shadow-card">
          <p className="text-sm font-medium">Appearance controls coming soon</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Launcher color, position, title and welcome message will be
            configurable here. For now the widget uses your indigo brand
            defaults.
          </p>
        </section>
      )}
    </div>
  );
}
