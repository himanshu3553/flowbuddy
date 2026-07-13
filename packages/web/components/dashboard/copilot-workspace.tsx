'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Code2, Eye, EyeOff, RefreshCw } from 'lucide-react';

import {
  setCopilotOrigins,
  regenerateCopilotKey,
  setCopilotShowCitations,
  setCopilotAppearance,
  setSenseEnabled,
  setCopilotShowMe,
  setReasonEnabled,
  setReasonImageEnabled,
  setReasonIncludeValues,
} from '@/lib/copilot-settings-actions';
import {
  ACCENT_PRESETS,
  COPILOT_DEFAULTS,
  LAUNCHER_STYLES,
  type CopilotAppearance,
} from '@/lib/copilot-appearance';
import type { EmbedStatus } from '@/lib/embed-status';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CopyButton } from '@/components/dashboard/copy-button';
import { StatusBadge } from '@/components/dashboard/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Tab = 'activity' | 'install' | 'settings' | 'appearance';

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

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </li>
  );
}

export function CopilotWorkspace({
  snippet,
  publicKey,
  allowedOrigins,
  primaryOrigin,
  widgetIsPlaceholder = false,
  showCitations = true,
  senseEnabled = true,
  showMe = false,
  reasonEnabled = true,
  reasonImageEnabled = false,
  reasonIncludeValues = false,
  activity,
  detection,
  appearance,
  onAppearanceChange,
}: {
  snippet: string;
  publicKey: string;
  allowedOrigins: string[];
  primaryOrigin: string;
  widgetIsPlaceholder?: boolean;
  showCitations?: boolean;
  senseEnabled?: boolean;
  showMe?: boolean;
  reasonEnabled?: boolean;
  reasonImageEnabled?: boolean;
  reasonIncludeValues?: boolean;
  activity: {
    total: number;
    window: number;
    answeredPct: number;
    up: number;
    down: number;
    recent: { id: string; question: string; answered: boolean; feedback: string | null }[];
  };
  detection: EmbedStatus;
  appearance: CopilotAppearance;
  onAppearanceChange: (next: CopilotAppearance) => void;
}) {
  const [tab, setTab] = useState<Tab>('activity');
  const [origins, setOrigins] = useState(allowedOrigins.join('\n'));
  const [rejectedOrigins, setRejectedOrigins] = useState<string[]>([]);
  const [cite, setCite] = useState(showCitations);
  const [sense, setSense] = useState(senseEnabled);
  const [showMeOn, setShowMeOn] = useState(showMe);
  // P2-M5 Reason — the founder toggle ladder (diagnostic answers · page image · typed values).
  const [reason, setReason] = useState(reasonEnabled);
  const [reasonImg, setReasonImg] = useState(reasonImageEnabled);
  const [reasonVals, setReasonVals] = useState(reasonIncludeValues);
  const [showKey, setShowKey] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function saveOrigins() {
    start(async () => {
      // The action normalizes entries to exact Origin-header form — reflect what was ACTUALLY
      // saved back into the textarea, and surface anything it couldn't parse (not saved).
      const result = await setCopilotOrigins(origins);
      setOrigins(result.origins.join('\n'));
      setRejectedOrigins(result.rejected);
      router.refresh();
    });
  }
  function toggleCite(value: boolean) {
    setCite(value); // optimistic
    start(async () => {
      try {
        await setCopilotShowCitations(value);
        router.refresh();
        toast.success(value ? 'Source citations on.' : 'Source citations off.');
      } catch {
        setCite(!value);
        toast.error('Could not save the setting. Please try again.');
      }
    });
  }
  // P2 Sense — the two workspace toggles (master Sense + the "show me" highlight).
  function toggleSense(value: boolean) {
    setSense(value); // optimistic
    start(async () => {
      try {
        await setSenseEnabled(value);
        router.refresh();
        toast.success(value ? 'Sense on — answers meet users where they are.' : 'Sense off — the widget stops probing.');
      } catch {
        setSense(!value);
        toast.error('Could not save the setting. Please try again.');
      }
    });
  }
  function toggleShowMe(value: boolean) {
    setShowMeOn(value); // optimistic
    start(async () => {
      try {
        await setCopilotShowMe(value);
        router.refresh();
        toast.success(value ? '"Show me" on — the widget highlights the current step.' : '"Show me" off.');
      } catch {
        setShowMeOn(!value);
        toast.error('Could not save the setting. Please try again.');
      }
    });
  }
  // P2-M5 Reason — the three diagnostic-path toggles (master · image tier · value unmasking).
  function toggleReason(value: boolean) {
    setReason(value); // optimistic
    start(async () => {
      try {
        await setReasonEnabled(value);
        router.refresh();
        toast.success(value ? 'Reason on — diagnostic answers enabled.' : 'Reason off — no page-state capture.');
      } catch {
        setReason(!value);
        toast.error('Could not save the setting. Please try again.');
      }
    });
  }
  function toggleReasonImage(value: boolean) {
    setReasonImg(value); // optimistic
    start(async () => {
      try {
        await setReasonImageEnabled(value);
        router.refresh();
        toast.success(
          value
            ? 'Page image on — remember to update your privacy policy (snippet below).'
            : 'Page image off.',
        );
      } catch {
        setReasonImg(!value);
        toast.error('Could not save the setting. Please try again.');
      }
    });
  }
  function toggleReasonValues(value: boolean) {
    setReasonVals(value); // optimistic
    start(async () => {
      try {
        await setReasonIncludeValues(value);
        router.refresh();
        toast.success(
          value
            ? 'Typed values on — passwords are never captured; card/SSN stay masked.'
            : 'Typed values off — captures are masked again.',
        );
      } catch {
        setReasonVals(!value);
        toast.error('Could not save the setting. Please try again.');
      }
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
  function saveAppearance() {
    start(async () => {
      try {
        await setCopilotAppearance(appearance);
        router.refresh();
        toast.success('Appearance saved — live on your embed’s next page load.');
      } catch {
        toast.error('Could not save the appearance. Please try again.');
      }
    });
  }

  const set = (patch: Partial<CopilotAppearance>) =>
    onAppearanceChange({ ...appearance, ...patch });
  const resolvedAccent = /^#[0-9a-fA-F]{6}$/.test(appearance.accent.trim())
    ? appearance.accent.trim()
    : COPILOT_DEFAULTS.accent;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'activity', label: 'Copilot activity' },
    { key: 'install', label: 'Install' },
    { key: 'settings', label: 'Settings' },
    { key: 'appearance', label: 'Appearance' },
  ];

  // Sample index.html for the "Show an example" dialog. The snippet is indented to sit inside
  // <body> and split out so the dialog can highlight exactly where it goes. (Template literals are
  // flush-left on purpose — leading source whitespace would otherwise become part of the output.)
  const indentedSnippet = snippet
    .split('\n')
    .map((l) => '    ' + l)
    .join('\n');
  const exampleHead = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hello World</title>
  </head>
  <body>
    <h1>Hello, world! 👋</h1>
    <p>Welcome to my app.</p>

`;
  const exampleSnippet = `    <!-- Sync copilot — paste right before </body> -->\n${indentedSnippet}`;
  const exampleTail = `\n  </body>\n</html>`;

  // Public key, masked by default (keep the recognizable prefix, hide the secret-ish tail).
  const maskedKey = publicKey.slice(0, 3) + '•'.repeat(24);

  // P2-M5 Reason — the ready-made disclosure paragraph for the founder's privacy policy. Silent
  // capture makes this load-bearing for THEIR legal posture, so it ships with the toggles, not as
  // a follow-up (docs/phase-2-reason.md §6).
  const disclosureSnippet =
    'When you ask our in-app assistant a question, it may take a one-time reading of the page you are on — ' +
    'the state of buttons and form fields (and, where enabled, a masked image of the page) — solely to ' +
    'diagnose your issue. Passwords are never collected, and personal data is masked in your browser ' +
    'before anything is sent.';

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

      {detection.detected && allowedOrigins.length === 0 && (
        // The widget is LIVE but no allowlist is set — the copilot answers from ANY website that
        // copies the public key (it's visible in the host page source). Shown on every tab until
        // the owner locks it down; the empty-allowlist dev default itself stays unchanged.
        <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-warning-border bg-warning-bg px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-dot" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-warning-text">
            <span className="font-semibold">Origin allowlist not set.</span> Your copilot is live
            and will answer from <span className="font-semibold">any website</span> that copies
            your public key. Add your app’s origins to lock it down.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTab('settings')}
          >
            Set allowed origins
          </Button>
        </div>
      )}

      {tab === 'activity' &&
        (activity.total === 0 ? (
          <div className="space-y-5">
            <section className="rounded-card border bg-card p-10 text-center shadow-card">
              <h3 className="text-[17px] font-bold tracking-tight text-secondary-foreground">
                No activity yet
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                Once the copilot is installed in your product, end-user
                questions and feedback show up here — and questions it can’t
                answer become “record this next” coverage gaps.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-5"
                onClick={() => setTab('install')}
              >
                Install the copilot
              </Button>
            </section>

            <section className="rounded-card border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                {detection.detected ? (
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success-dot" />
                ) : (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning-dot" />
                  </span>
                )}
                <p className="text-sm">
                  {detection.detected ? (
                    <>
                      Copilot detected on{' '}
                      <span className="font-semibold">
                        {detection.origin ?? primaryOrigin}
                      </span>
                      {detection.lastSeenLabel ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · last seen {detection.lastSeenLabel}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      Listening for the copilot on{' '}
                      <span className="font-semibold">{primaryOrigin}</span>… not
                      detected yet.
                    </>
                  )}
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
                <ChecklistItem done={detection.detected} label="Snippet pasted" />
                <ChecklistItem
                  done={allowedOrigins.length > 0}
                  label="Origin allowlisted"
                />
              </ul>
            </section>
          </div>
        ) : (
          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Copilot activity</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {activity.window}{' '}
              {activity.window === 1 ? 'question' : 'questions'} in the last 7
              days · {activity.answeredPct}% answered · 👍 {activity.up} · 👎{' '}
              {activity.down}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              {activity.total} all-time · same 7-day numbers as Home &amp;
              Analytics
            </p>
            <ul className="mt-3 divide-y">
              {activity.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <StatusBadge tone={r.answered ? 'success' : 'danger'} dot={false}>
                    {r.answered ? 'Answered' : 'Declined'}
                  </StatusBadge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.question}
                  </span>
                  {r.feedback && (
                    <span className="text-sm">
                      {r.feedback === 'up' ? '👍' : '👎'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

      {tab === 'install' && (
        <div className="space-y-5">
          <section className="rounded-card border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13.5px] font-bold text-ink">Embed Copilot snippet</h3>
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

          <Dialog>
            <section className="rounded-card border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13.5px] font-bold text-ink">
                    How to embed the copilot snippet
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Go live in 5 minutes
                  </p>
                </div>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  >
                    <Code2 className="h-4 w-4" />
                    Show an example
                  </Button>
                </DialogTrigger>
              </div>
              <ol className="mt-4 space-y-3">
                <Step n={1} title="Copy the snippet">
                  Use <span className="font-medium">Copy snippet</span> above — it
                  copies the full{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    &lt;script&gt;
                  </code>{' '}
                  tag with your public key already baked in.
                </Step>
                <Step n={2} title="Open your site’s base template">
                  The layout that renders on every page — e.g. your root layout,
                  base HTML file, or a shared footer partial.
                </Step>
                <Step n={3} title="Paste it before the closing body tag">
                  Drop the snippet in just before{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    &lt;/body&gt;
                  </code>{' '}
                  so it loads on every page. That’s the whole install.
                </Step>
                <Step n={4} title="Allow your site’s origin">
                  In the{' '}
                  <button
                    type="button"
                    onClick={() => setTab('settings')}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Settings
                  </button>{' '}
                  tab, add your site’s URL to the origin allowlist so the copilot
                  may run there. (Leave it empty while testing.)
                </Step>
                <Step n={5} title="Deploy & reload">
                  Publish your site and refresh — the copilot launcher appears in
                  the corner. Use <span className="font-medium">Recheck</span>{' '}
                  below to confirm it’s detected.
                </Step>
              </ol>
            </section>

            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Example — index.html</DialogTitle>
                <DialogDescription>
                  A minimal page with the copilot embedded. The highlighted lines
                  are your snippet — paste them right before the closing{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    &lt;/body&gt;
                  </code>{' '}
                  tag.
                </DialogDescription>
              </DialogHeader>
              <pre className="overflow-x-auto rounded-tile bg-code-bg p-4 font-mono text-[11.5px] leading-[1.7] text-code-fg">
                {exampleHead}
                <span className="rounded bg-primary/25 ring-1 ring-primary/40">
                  {exampleSnippet}
                </span>
                {exampleTail}
              </pre>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
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
              <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                <div>
                  <p className="text-sm font-medium">Cite the workflow used</p>
                  <p className="text-xs text-muted-foreground">
                    Show a source chip on every grounded answer.
                  </p>
                </div>
                <Switch
                  checked={cite}
                  onCheckedChange={toggleCite}
                  disabled={pending}
                  aria-label="Cite the workflow used"
                />
              </div>
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">
              Sense — in-context help
            </h3>
            <p className="text-xs text-muted-foreground">
              The copilot detects which approved workflow and step a user is on
              (a read-only glance at their page when they ask — no recording,
              no screenshots) and answers for that exact spot.
            </p>
            <div className="mt-3 divide-y">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Enable Sense</p>
                  <p className="text-xs text-muted-foreground">
                    Positional answers: &ldquo;you&rsquo;re on step 3 — here&rsquo;s
                    how to get unstuck, then the path to done.&rdquo;
                  </p>
                </div>
                <Switch
                  checked={sense}
                  onCheckedChange={toggleSense}
                  disabled={pending}
                  aria-label="Enable Sense (in-context help)"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                <div>
                  <p className="text-sm font-medium">&ldquo;Show me&rdquo; highlight</p>
                  <p className="text-xs text-muted-foreground">
                    Also outline the current step&rsquo;s element on the page
                    alongside a positional answer.
                  </p>
                </div>
                <Switch
                  checked={showMeOn}
                  onCheckedChange={toggleShowMe}
                  disabled={pending || !sense}
                  aria-label='"Show me" highlight'
                />
              </div>
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">
              Reason — diagnostic answers
            </h3>
            <p className="text-xs text-muted-foreground">
              On &ldquo;why isn&rsquo;t this working?&rdquo; questions, the copilot
              takes a one-time reading of the user&rsquo;s page state (values
              masked) and compares it with your recording of that step working —
              then explains exactly what&rsquo;s blocking them.
            </p>
            <div className="mt-3 divide-y">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Enable Reason</p>
                  <p className="text-xs text-muted-foreground">
                    Structured page-state capture at ask time only — no
                    recording, no screenshots, all values masked.
                  </p>
                </div>
                <Switch
                  checked={reason}
                  onCheckedChange={toggleReason}
                  disabled={pending}
                  aria-label="Enable Reason (diagnostic answers)"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Include page image</p>
                  <p className="text-xs text-muted-foreground">
                    Also render a masked image of the user&rsquo;s page for
                    visual issues (layout, overlays, low-semantics UIs). The
                    most sensitive capture — add the disclosure below to your
                    privacy policy.
                  </p>
                </div>
                <Switch
                  checked={reasonImg}
                  onCheckedChange={toggleReasonImage}
                  disabled={pending || !reason}
                  aria-label="Include page image"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                <div>
                  <p className="text-sm font-medium">Include typed values</p>
                  <p className="text-xs text-muted-foreground">
                    Send what users typed instead of filled/empty flags.
                    Passwords are never captured; card &amp; SSN patterns stay
                    masked regardless.
                  </p>
                </div>
                <Switch
                  checked={reasonVals}
                  onCheckedChange={toggleReasonValues}
                  disabled={pending || !reason}
                  aria-label="Include typed values"
                />
              </div>
            </div>
            {reason && (
              <div className="mt-3 rounded-md border border-dashed bg-[color:var(--paper-2)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] font-semibold text-muted-foreground">
                    Privacy-policy disclosure — paste into your policy (capture
                    is silent to end-users, so the disclosure is yours to
                    carry):
                  </p>
                  <CopyButton value={disclosureSnippet} label="Copy" />
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {disclosureSnippet}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <div className="mb-3">
              <h3 className="text-[13.5px] font-bold text-ink">Public key</h3>
              <p className="text-xs text-muted-foreground">
                Safe to expose in your front-end. Rotate any time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="block flex-1 break-all rounded-control border bg-secondary px-3 py-2 font-mono text-xs">
                {showKey ? publicKey : maskedKey}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide public key' : 'Show public key'}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
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
              {rejectedOrigins.length > 0 && (
                <p className="text-[11.5px] text-danger-text">
                  Couldn’t parse (not saved):{' '}
                  <span className="font-mono">{rejectedOrigins.join(', ')}</span> — use{' '}
                  <span className="font-mono">https://app.example.com</span> form.
                </p>
              )}
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
        </div>
      )}

      {tab === 'appearance' && (
        <div className="space-y-5">
          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Brand color</h3>
            <p className="text-xs text-muted-foreground">
              The accent for the launcher, header, and your customers’ messages.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((c) => {
                const active = resolvedAccent.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ accent: c })}
                    style={{ backgroundColor: c }}
                    className={cn(
                      'h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition',
                      active
                        ? 'ring-2 ring-foreground'
                        : 'ring-1 ring-black/10 hover:ring-black/25',
                    )}
                    aria-label={`Use ${c}`}
                  />
                );
              })}
              <span className="mx-1 h-6 w-px bg-border" />
              <input
                type="color"
                value={resolvedAccent}
                onChange={(e) => set({ accent: e.target.value })}
                className="h-8 w-9 shrink-0 cursor-pointer rounded-control border bg-transparent p-1"
                aria-label="Custom accent color"
              />
              <Input
                value={appearance.accent}
                onChange={(e) => set({ accent: e.target.value })}
                placeholder={COPILOT_DEFAULTS.accent}
                className="h-8 w-28 font-mono text-xs"
                aria-label="Accent hex"
              />
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Header title</h3>
            <p className="text-xs text-muted-foreground">
              Shown at the top of the copilot panel.
            </p>
            <Input
              value={appearance.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={COPILOT_DEFAULTS.title}
              maxLength={40}
              className="mt-3 text-sm"
            />
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Greeting</h3>
            <p className="text-xs text-muted-foreground">
              The first message customers see when they open the copilot.
            </p>
            <Textarea
              value={appearance.greeting}
              onChange={(e) => set({ greeting: e.target.value })}
              placeholder={COPILOT_DEFAULTS.greeting}
              maxLength={200}
              rows={2}
              className="mt-3 text-sm"
            />
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Launcher position</h3>
            <p className="text-xs text-muted-foreground">
              Which corner the copilot button sits in on your site.
            </p>
            <div className="mt-3 inline-flex rounded-control border p-0.5">
              {(['left', 'right'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ position: p })}
                  className={cn(
                    'rounded-[7px] px-3.5 py-1 text-xs font-semibold capitalize transition-colors',
                    appearance.position === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-card border bg-card p-5 shadow-card">
            <h3 className="text-[13.5px] font-bold text-ink">Launcher</h3>
            <p className="text-xs text-muted-foreground">
              The button customers click to open the copilot — see it live in
              the preview.
            </p>
            <div className="mt-3 inline-flex rounded-control border p-0.5">
              {LAUNCHER_STYLES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set({ launcherStyle: opt.value })}
                  className={cn(
                    'rounded-[7px] px-3 py-1 text-xs font-semibold transition-colors',
                    appearance.launcherStyle === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {appearance.launcherStyle !== 'icon' && (
              <div className="mt-3">
                <Label
                  htmlFor="launcher-text"
                  className="text-xs text-muted-foreground"
                >
                  Button text
                </Label>
                <Input
                  id="launcher-text"
                  value={appearance.launcherText}
                  onChange={(e) => set({ launcherText: e.target.value })}
                  placeholder={COPILOT_DEFAULTS.launcherText}
                  maxLength={30}
                  className="mt-1 text-sm"
                />
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={saveAppearance}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save appearance'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Changes preview live; Save applies them to your embedded copilot on its next page
              load — no snippet changes needed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
