/**
 * Which message kinds may ride `/v1/copilot/answer` as conversation history — the wire-side twin
 * of `PERSISTED_KINDS` (index.ts), and an ALLOWLIST for the same reason: a kind not listed here
 * cannot leave the page, so excluding a sensitive kind means never adding it, not remembering to
 * filter it at every call site.
 *
 * Deliberately absent:
 * - `user.value` — D3's chat-supplied run input (docs/build/agent.md §6). The value exists for one
 *   fill and must never ride /answer or any log. History used to exclude only `assistant.error`,
 *   which let a typed value leak onto the wire with the NEXT question — this allowlist is the fix.
 * - `assistant.error` — a transport failure is about a moment, not the conversation (same
 *   rationale as its absence from PERSISTED_KINDS).
 */
export const HISTORY_KINDS: ReadonlySet<string> = new Set([
  'user.question',
  'assistant.answer',
  'assistant.decline',
  // The run's commentary is conversational context the model may need for a follow-up.
  'assistant.narration',
]);

const HISTORY_MAX_TURNS = 10; // the server slices to 10 anyway — a long chat must not grow the payload

/**
 * Build the history payload for an /answer call. `messages` includes the just-pushed question;
 * the final entry is dropped (the question rides separately), then the last 10 allowed turns win.
 */
export function historyForAnswer<T extends { role: 'user' | 'assistant'; kind: string; content: string }>(
  messages: readonly T[],
): Array<{ role: T['role']; content: string }> {
  return messages
    .filter((m) => HISTORY_KINDS.has(m.kind))
    .slice(0, -1)
    .slice(-HISTORY_MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
}
