'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, RefreshCw } from 'lucide-react';
import {
  setCopilotOrigins,
  regenerateCopilotKey,
} from '@/lib/copilot-settings-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy embed snippet'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={rotate}
          disabled={pending}
        >
          <RefreshCw className="h-4 w-4" />
          Rotate key
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="origins">Allowed origins</Label>
        <p className="text-xs text-muted-foreground">
          One per line. Leave empty to allow any origin while testing.
        </p>
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
    </div>
  );
}
