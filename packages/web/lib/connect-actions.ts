'use server';

import { prisma } from '@flowbuddy/db';
import { auth } from '@/auth';
import { createApiToken } from '@/lib/tokens';

export interface ConnectPayload {
  token: string;
  apiBaseUrl: string;
  email: string;
  org: string;
}

/**
 * Mint a fresh workspace token for the recorder extension and return it with the API URL.
 * Called from the authenticated `/connect` page, which relays the payload to the extension —
 * so the user never copies a token or types the API URL. Auth-gated; token is workspace-scoped.
 */
export async function connectExtension(): Promise<
  { ok: true; payload: ConnectPayload } | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: 'Please sign in to FlowBuddy Studio first.' };

  const ws = await prisma.workspace.findFirst({ where: { ownerId: userId } });
  if (!ws) return { ok: false, error: 'No workspace found for your account.' };

  const token = await createApiToken(ws.id, 'FlowBuddy Recorder extension');
  const apiBaseUrl = process.env.FLOWBUDDY_API_URL || 'http://localhost:8787';
  return {
    ok: true,
    payload: { token, apiBaseUrl, email: session.user?.email ?? '', org: ws.name },
  };
}
