import OpenAI from 'openai';
import type { CapturedEvent, Marker } from '@sync/shared';

export interface Segment { title: string; eventIds: string[]; }

export function eventLabel(ev: CapturedEvent): string {
  const t = ev.target || {};
  const name = t.accessibleName || t.text || t.attributes?.placeholder || t.tag || ev.type;
  const clipped = String(name).replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${ev.type} "${clipped}" @ ${ev.route?.path ?? ''}`;
}

// Single-stage, event-aware segmenter. Boundaries are driven primarily by goal-completion /
// terminal states (redirects, route resets, dashboards, sign-outs, confirmations) — visible in the
// event routes — with narration + markers as supporting signals. See docs/kb-step-distillation.md.
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
- User-placed markers: explicit author boundaries. Always start a new workflow at each.

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
 * in a workflow, so nothing is ever silently dropped. See docs/kb-step-distillation.md.
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
  const timeline = events
    .map((ev) => {
      const n = narration.get(ev.id);
      const post = ev.postAction?.route?.path;
      const nav = post && post !== ev.route?.path ? ` -> ${post}` : '';
      return `- id=${ev.id} | ${eventLabel(ev)}${nav}${n ? ` | said: "${n.slice(0, 160)}"` : ''}`;
    })
    .join('\n');

  const markerLines = markers.length
    ? markers.map((m) => `- marker @ ${m.t}ms${m.label ? `: ${m.label}` : ''}`).join('\n')
    : '(none)';

  const overall = overallNarration.trim().slice(0, 6000);
  const overallBlock = overall ? `Overall narration:\n"""${overall}"""\n\n` : '';

  const user = `${overallBlock}Events (in order):\n${timeline}\n\nUser markers:\n${markerLines}\n\nReturn the workflows.`;

  const res = await openai.chat.completions.create({
    model,
    temperature: 0, // deterministic segmentation
    messages: [
      { role: 'system', content: SEGMENT_SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: SEGMENT_SCHEMA as any },
  });

  let parsed: {
    workflows?: { title?: string; event_ids?: string[]; boundary_evidence?: string; confidence?: string }[];
  };
  try {
    parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
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
  console.log(
    `[segment] ${raw.length} workflow(s): ${raw.map((r) => `"${r.title}"(${r.eventIds.length},${r.confidence})`).join(', ')}`,
  );
  for (const r of raw) {
    if (r.confidence === 'low') console.warn(`[segment] low-confidence boundary: "${r.title}" — ${r.evidence}`);
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
      console.warn(`[segment] model omitted ${omitted}/${allIds.length} events — carry-forward assigning so none are lost`);
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
