'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { connectExtension } from '@/lib/connect-actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Phase = 'idle' | 'connecting' | 'done' | 'error';

/**
 * Talks to the extension over `window.postMessage` (the extension injects a content-script bridge
 * on this origin). We mint the token server-side, post it to the bridge, and wait for ack.
 */
export function ConnectClient({ email }: { email: string }) {
  const [extPresent, setExtPresent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data as { source?: string; type?: string } | null;
      if (d?.source !== 'sync-ext') return;
      if (d.type === 'present') setExtPresent(true);
      if (d.type === 'connected') setPhase('done');
    }
    window.addEventListener('message', onMessage);
    // Ask the bridge to announce itself (covers the case where it loaded before us).
    window.postMessage({ source: 'sync-page', type: 'ping' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function connect() {
    setPhase('connecting');
    setError(null);
    const res = await connectExtension();
    if (!res.ok) {
      setError(res.error);
      setPhase('error');
      return;
    }
    window.postMessage(
      { source: 'sync-page', type: 'connect', ...res.payload },
      window.location.origin,
    );
    // The bridge acks with 'connected'; fall back to success if the ack is missed.
    setTimeout(() => setPhase((p) => (p === 'connecting' ? 'done' : p)), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Connect the Sync Recorder
          </h1>
          <p className="text-sm text-muted-foreground">
            Link the browser extension to your account — no tokens to copy.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardDescription>Signed in as</CardDescription>
            <CardTitle className="text-base">{email}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {phase === 'done' ? (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Connected. You can close this tab and start recording from the
                extension.
              </div>
            ) : (
              <>
                {!extPresent && (
                  <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                    The Sync Recorder extension isn&apos;t detected on this page.
                    Install/enable it (chrome://extensions), then reload this
                    page.
                  </p>
                )}
                <Button
                  type="button"
                  className="w-full"
                  onClick={connect}
                  disabled={!extPresent || phase === 'connecting'}
                >
                  {phase === 'connecting'
                    ? 'Connecting…'
                    : 'Connect this extension'}
                </Button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Back to Studio
          </Link>
        </p>
      </div>
    </div>
  );
}
