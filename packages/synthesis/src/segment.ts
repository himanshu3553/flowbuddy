import OpenAI from 'openai';
import type { CapturedEvent, Marker } from '@flowbuddy/shared';
import { createLogger } from '@flowbuddy/logger';
import { structuredJsonCall } from './responses';

const log = createLogger('segment');

export interface Segment { title: string; eventIds: string[]; }

/**
 * How one captured event is described to every model in the pipeline.
 *
 * A PLACEHOLDER IS NOT A LABEL, and collapsing the two costs a whole step. This used to fall back
 * `accessibleName || text || placeholder` and render all three identically, so a project-name field
 * whose only DOM text is `placeholder="My Website Chatbot"` arrived looking like a field CALLED "My
 * Website Chatbot" — sitting next to a bot-name field called "AI Assistant". Two adjacent text fields
 * that both read as a bot name: the distiller merged them and the project name lost its step
 * entirely. (It survived only while the recorder's sample values were passed through and happened to
 * tell them apart — which is exactly the leak `valueHint` had to close.)
 *
 * Marking the source makes the placeholder do the job it can actually do: "the field whose example
 * text is My Website Chatbot" reads as a project-name field, where a field NAMED that does not.
 */
export function eventLabel(ev: CapturedEvent): string {
  const t = ev.target || {};
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80);
  const label = clip(t.accessibleName || t.text || '');
  const placeholder = clip(t.attributes?.placeholder || '');
  const what = label
    ? `"${label}"`
    : placeholder
      ? `placeholder "${placeholder}"`
      : `<${t.tag || ev.type}>`;
  return `${ev.type} ${what} @ ${ev.route?.path ?? ''}`;
}

// Single-stage, event-aware segmenter. Boundaries are driven primarily by goal-completion /
// terminal states (redirects, route resets, dashboards, sign-outs, confirmations) — visible in the
// event routes — with narration + markers as supporting signals. See docs/build/kb-step-distillation.md.
const SEGMENT_SYSTEM = `You segment ONE screen-recording session into the distinct workflows it documents.
A WORKFLOW is one complete task a user would look up in a help center and follow
start-to-finish to reach a goal (e.g. "Create an account", "Log in", "Create a
project", "Sign out").

Boundaries come from several signals together. No single signal is authoritative.

PRIMARY signal — goal completion (terminal state):
A workflow ends when its task reaches a success/terminal state and a NEW action
sequence begins. Terminal states include: a success confirmation or toast; landing
on the newly created resource; a redirect or return to a dashboard/home/hub; a
URL/route reset; a sign-out; or a long pause before the next action. The boundary is
the COMPLETION, not the narration. Use this even when narration is continuous and
never announces a new task.

SUPPORTING signals:
- Narration: authors sometimes enumerate tasks up front ("we'll show how to create
  an account, log in, and create a project") or call out transitions ("now let's...",
  "next..."). Treat each distinct task the narration names as its own workflow. But do
  NOT require explicit narration to split — most demos narrate continuously and never
  say "new workflow." Absence of a verbal marker is NOT evidence of a single workflow.
- User-placed markers: explicit author boundaries, given as timestamps on the same
  clock as the events' "@ Nms" times. Always start a new workflow at the first event
  at or after each marker's time.

ONE GOAL = ONE WORKFLOW:
The phases of a single task — navigating to a page, filling a form, toggling an
option, clicking submit, landing on the result — are STEPS of that one workflow, not
separate workflows. Do not split a task into its phases.

WHEN UNCERTAIN whether a segment is a new goal or a phase of the current one:
Split at the clearest goal-completion. A human editor reviews every boundary and
merges false splits in one click; an unsplit workflow buried inside another is far
harder to recover. Prefer a clean split at a terminal state over merging.

PROCEDURE (follow in order):
1. Scan the whole session and LIST every goal-completion / terminal state you observe,
   in order, with the evidence for each (terminal-state type, narration cue, or marker).
2. Map that list to workflows — one per distinct goal.
3. Assign EVERY event id to exactly one workflow, preserving order. Drop nothing.

OUTPUT per workflow:
- title: the end goal ("Create an account"), never a phase ("Filling the form")
- event_ids: ordered, exhaustive
- boundary_evidence: what marked the start/end (terminal state, narration, or marker)
- confidence: high | medium | low — use low to flag a boundary the editor should check`;

const SEGMENT_SCHEMA = {
  name: 'segmentation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      workflows: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            event_ids: { type: 'array', items: { type: 'string' } },
            boundary_evidence: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['title', 'event_ids', 'boundary_evidence', 'confidence'],
        },
      },
    },
    required: ['workflows'],
  },
} as const;

/**
 * Split one recording's events into workflows in a single event-aware LLM pass (terminal-state
 * driven; narration + markers supporting). A carry-forward guard then guarantees EVERY event lands
 * in a workflow, so nothing is ever silently dropped. See docs/build/kb-step-distillation.md.
 */
export async function segment(
  openai: OpenAI,
  model: string,
  events: CapturedEvent[],
  markers: Marker[],
  narration: Map<string, string>,
  overallNarration = '',
): Promise<Segment[]> {
  if (events.length === 0) return [];
  const allIds = events.map((e) => e.id);

  // Timeline — surface routes AND route transitions (the terminal-state signal) + narration.
  // Each line carries the event's timestamp, on the same clock as the markers: without it the model
  // is told "split at the marker at 62000ms" while looking at a list with no clocks — it cannot
  // place a marker between two events, and a long pause (a documented boundary signal) is invisible.
  const timeline = events
    .map((ev) => {
      const n = narration.get(ev.id);
      const post = ev.postAction?.route?.path;
      const nav = post && post !== ev.route?.path ? ` -> ${post}` : '';
      return `- id=${ev.id} @ ${ev.t}ms | ${eventLabel(ev)}${nav}${n ? ` | said: "${n.slice(0, 160)}"` : ''}`;
    })
    .join('\n');

  const markerLines = markers.length
    ? markers.map((m) => `- marker @ ${m.t}ms${m.label ? `: ${m.label}` : ''}`).join('\n')
    : '(none)';

  const overall = overallNarration.trim().slice(0, 6000);
  const overallBlock = overall ? `Overall narration:\n"""${overall}"""\n\n` : '';

  const user = `${overallBlock}Events (in order):\n${timeline}\n\nUser markers:\n${markerLines}\n\nReturn the workflows.`;

  const content = await structuredJsonCall({
    openai,
    model,
    system: SEGMENT_SYSTEM,
    user,
    schema: SEGMENT_SCHEMA,
    stage: 'segmentation',
  });

  let parsed: {
    workflows?: { title?: string; event_ids?: string[]; boundary_evidence?: string; confidence?: string }[];
  };
  try {
    parsed = JSON.parse(content || '{}');
  } catch {
    parsed = {};
  }

  const known = new Set(allIds);
  const raw = (parsed.workflows ?? []).map((w, i) => ({
    title: (w.title || '').trim() || `Workflow ${i + 1}`,
    eventIds: (w.event_ids || []).filter((id) => known.has(id)),
    evidence: w.boundary_evidence || '',
    confidence: w.confidence || 'medium',
  }));

  // Observability: the model's decision + any low-confidence boundary the editor should review.
  log.info(
    { workflows: raw.map((r) => ({ title: r.title, events: r.eventIds.length, confidence: r.confidence })) },
    `segmented into ${raw.length} workflow(s)`,
  );
  for (const r of raw) {
    if (r.confidence === 'low') log.warn({ title: r.title, evidence: r.evidence }, 'low-confidence boundary');
  }

  // Map each event → its workflow (first assignment wins).
  const assignment = new Map<string, number>();
  raw.forEach((r, ri) => {
    for (const id of r.eventIds) if (!assignment.has(id)) assignment.set(id, ri);
  });

  // GUARD against silent loss: EVERY event must land in a workflow. Any omitted event inherits the
  // preceding event's workflow (carry-forward), so nothing is ever dropped.
  if (raw.length > 0) {
    const omitted = allIds.filter((id) => !assignment.has(id)).length;
    if (omitted > 0) {
      log.warn(
        { omitted, total: allIds.length },
        'model omitted events — carry-forward assigning so none are lost',
      );
    }
    let current = assignment.get(events.find((e) => assignment.has(e.id))?.id ?? '') ?? 0;
    for (const e of events) {
      if (assignment.has(e.id)) current = assignment.get(e.id)!;
      else assignment.set(e.id, current);
    }
  }

  // Rebuild each workflow's eventIds in true global order (complete + correctly ordered).
  let segments: Segment[] = raw
    .map((r, ri) => ({ title: r.title, eventIds: allIds.filter((id) => assignment.get(id) === ri) }))
    .filter((s) => s.eventIds.length > 0);

  if (segments.length === 0) segments = [{ title: 'Recorded workflow', eventIds: allIds }];
  return segments;
}
