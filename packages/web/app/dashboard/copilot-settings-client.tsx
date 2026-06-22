'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCopilotOrigins, regenerateCopilotKey } from '@/lib/copilot-settings-actions';

/** P1-M9 — Studio controls: copy the embed snippet, edit the origin allowlist, rotate the key. */
export function CopilotSettingsClient({
  snippet,
  allowedOrigins,
}: {
  snippet: string;
  allowedOrigins: string[];
}) {
  const [origins, setOrigins] = useState(allowedOrigins.join('\n'));
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function copy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  function saveOrigins() {
    start(async () => { await setCopilotOrigins(origins); router.refresh(); });
  }
  function rotate() {
    if (!confirm('Rotate the key? The current snippet/key stops working immediately.')) return;
    start(async () => { await regenerateCopilotKey(); router.refresh(); });
  }

  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        <button type="button" onClick={copy}>{copied ? 'Copied ✓' : 'Copy embed snippet'}</button>
        <button type="button" onClick={rotate} disabled={pending} style={{ background: '#b07407' }}>Rotate key</button>
      </div>

      <label className="muted" style={{ display: 'block', marginBottom: 4 }}>
        Allowed origins (one per line). Leave empty to allow any origin while testing.
      </label>
      <textarea
        value={origins}
        onChange={(e) => setOrigins(e.target.value)}
        placeholder={'https://app.yourcompany.com\nhttps://www.yourcompany.com'}
        rows={4}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 8, borderRadius: 8, border: '1px solid #d6d6d6' }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={saveOrigins} disabled={pending}>{pending ? 'Saving…' : 'Save origins'}</button>
      </div>
    </div>
  );
}
