'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { connectExtension } from '@/lib/connect-actions';

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
    window.postMessage({ source: 'sync-page', type: 'connect', ...res.payload }, window.location.origin);
    // The bridge acks with 'connected'; fall back to success if the ack is missed.
    setTimeout(() => setPhase((p) => (p === 'connecting' ? 'done' : p)), 2000);
  }

  return (
    <main style={{ maxWidth: 520 }}>
      <h1>Connect the Sync Recorder</h1>
      <p className="sub">Link the browser extension to your account so it can upload recordings — no tokens to copy.</p>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>Signed in as</p>
        <p style={{ marginTop: 0 }}><strong>{email}</strong></p>

        {phase === 'done' ? (
          <p style={{ color: '#176c33', fontWeight: 600 }}>
            ✓ Connected. You can close this tab and start recording from the extension.
          </p>
        ) : (
          <>
            {!extPresent && (
              <p className="rationale">
                The Sync Recorder extension isn&apos;t detected on this page. Install/enable it
                (chrome://extensions), then reload this page.
              </p>
            )}
            <button type="button" onClick={connect} disabled={!extPresent || phase === 'connecting'}>
              {phase === 'connecting' ? 'Connecting…' : 'Connect this extension'}
            </button>
            {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
          </>
        )}
      </div>

      <p className="muted"><Link href="/dashboard">← Back to Studio</Link></p>
    </main>
  );
}
