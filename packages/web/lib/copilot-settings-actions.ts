'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';

export interface SaveOriginsResult {
  /** What was actually saved — normalized to exact `scheme://host[:port]` Origin-header form. */
  origins: string[];
  /** Entries that couldn't be parsed as an origin (NOT saved) — surfaced to the user. */
  rejected: string[];
}

/**
 * P1-M9 — set the copilot origin allowlist (newline/comma separated). Empty = allow any origin.
 * Entries are NORMALIZED to the exact string browsers send as the `Origin` header — the API
 * compares with strict equality, so `https://app.acme.com/` (trailing slash) or a bare
 * `app.acme.com` as typed would never match and the owner would believe they're locked down
 * when they aren't. Bare domains assume https; paths/slashes are stripped via `new URL().origin`.
 */
export async function setCopilotOrigins(originsText: string): Promise<SaveOriginsResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const raw of originsText.split(/[\n,]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(entry) ? entry : `https://${entry}`;
    try {
      const url = new URL(withScheme);
      // Only http(s) pages can embed the widget; anything else has no matchable Origin.
      if (!/^https?:$/.test(url.protocol) || !url.hostname || url.origin === 'null') {
        rejected.push(entry);
      } else if (!origins.includes(url.origin)) {
        origins.push(url.origin);
      }
    } catch {
      rejected.push(entry);
    }
  }
  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { copilotAllowedOrigins: origins } });
  revalidatePath('/dashboard/copilot');
  return { origins, rejected };
}

/** Appearance (host branding) — persisted so it prefills the UI and bakes into the embed snippet. */
export async function setCopilotAppearance(input: {
  accent: string;
  title: string;
  greeting: string;
  position: string;
  launcherStyle: string;
  launcherText: string;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const accent = /^#[0-9a-fA-F]{6}$/.test(input.accent.trim()) ? input.accent.trim() : null;
  const title = input.title.trim().slice(0, 40) || null;
  const greeting = input.greeting.trim().slice(0, 200) || null;
  const position = input.position === 'left' ? 'left' : 'right';
  const launcherStyle =
    input.launcherStyle === 'text' || input.launcherStyle === 'text-outline'
      ? input.launcherStyle
      : 'icon';
  const launcherText = input.launcherText.trim().slice(0, 30) || null;
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: {
      copilotAccent: accent,
      copilotTitle: title,
      copilotGreeting: greeting,
      copilotPosition: position,
      copilotLauncherStyle: launcherStyle,
      copilotLauncherText: launcherText,
    },
  });
  revalidatePath('/dashboard/copilot');
}

/** Trust setting — show/hide the "Source: <workflow>" citation chip on grounded answers. */
export async function setCopilotShowCitations(showCitations: boolean): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { copilotShowCitations: showCitations },
  });
  revalidatePath('/dashboard/copilot');
}

/** P2 Sense — the per-workspace master toggle (gates the sense-plan endpoint; off = no probing). */
export async function setSenseEnabled(enabled: boolean): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { senseEnabled: enabled },
  });
  revalidatePath('/dashboard/copilot');
}

/** P2-M3 "show me" — highlight the current step's element on the host page alongside positional answers. */
export async function setCopilotShowMe(showMe: boolean): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { copilotShowMe: showMe },
  });
  revalidatePath('/dashboard/copilot');
}

/** Rotate the public embeddable key (invalidates the old one immediately). */
export async function regenerateCopilotKey(): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { copilotPublicKey: 'pk_' + randomBytes(24).toString('hex') },
  });
  revalidatePath('/dashboard/copilot');
}
