'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Studio toast feedback (convention since 2026-07-08): every action that mutates the server shows a
 * success toast on completion and an error toast on failure, so the user always knows the click
 * landed. Call `toast.success('…')` / `toast.error('…')` from any client component; the single
 * `<Toaster />` in the root layout renders the stack. No context to thread — a module-level
 * listener keeps call sites one-liners (and there is exactly one Toaster, so one listener).
 */

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION_MS: Record<ToastKind, number> = { success: 4000, error: 7000 }; // errors linger
const MAX_VISIBLE = 3;

let listener: ((t: ToastItem) => void) | null = null;
let nextId = 1;

function push(kind: ToastKind, message: string): void {
  // No Toaster mounted (shouldn't happen — it lives in the root layout) → drop silently.
  listener?.({ id: nextId++, kind, message });
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), DURATION_MS[t.kind]);
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-5 top-5 z-[100] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={cn(
            // Filled status color + white text: action feedback must read at a glance, so the toast
            // uses the solid --success-500 / --danger-500 tokens rather than the pale tint surfaces.
            'pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-tile p-3.5 text-white shadow-dialog',
            'animate-in slide-in-from-top-2 fade-in duration-200',
            t.kind === 'success' ? 'bg-success' : 'bg-danger',
          )}
        >
          {t.kind === 'success' ? (
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-px h-4 w-4 shrink-0" />
          )}
          <p className="text-[13px] font-semibold leading-snug">{t.message}</p>
        </div>
      ))}
    </div>
  );
}
