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

// Single-stage, event-aware segmenter, run once per marker-delimited span. User markers are HARD
// cut points enforced by partitionByMarkers (structure, not prompt — see its header); within a
// span, boundaries are driven primarily by goal-completion / terminal states (redirects, route
// resets, dashboards, sign-outs, confirmations) visible in the event routes, with narration as the
// supporting signal. See docs/build/kb-step-distillation.md.
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
  say "new workflow." Absence of a verbal cue is NOT evidence of a single workflow.

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
   in order, with the evidence for each (terminal-state type or narration cue).
2. Map that list to workflows — one per distinct goal.
3. Assign EVERY event id to exactly one workflow, preserving order. Drop nothing.

OUTPUT per workflow:
- title: the end goal ("Create an account"), never a phase ("Filling the form")
- event_ids: ordered, exhaustive
- boundary_evidence: what marked the start/end (terminal state or narration)
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
 * Split a recording's cleaned events at the author's "new workflow" markers — the DETERMINISTIC
 * half of segmentation. Each returned span is segmented by the model SEPARATELY, so a workflow
 * structurally cannot span a marker no matter what the model does: the events on either side are
 * never in the same prompt. (Markers used to be prompt lines under a "supporting signals" heading,
 * which the model could — and under drift, did — overrule, silently merging across an explicit
 * author boundary. Do not demote them back to prompt text.)
 *
 * A marker cuts at the first event with `t >= marker.t`, on the shared active-elapsed clock the
 * recorder stamps on both. Markers before the first event, after the last, or landing on the same
 * cut collapse harmlessly: empty spans are never produced, and zero markers yields one span — the
 * exact pre-partition behaviour.
 */
export function partitionByMarkers(events: CapturedEvent[], markers: Marker[]): CapturedEvent[][] {
  if (events.length === 0) return [];
  const cuts = new Set<number>();
  for (const m of markers) {
    const idx = events.findIndex((e) => e.t >= m.t);
    if (idx > 0) cuts.add(idx); // idx 0 or -1 → the span before/after would be empty; no cut
  }
  const starts = [0, ...[...cuts].sort((a, b) => a - b)];
  return starts.map((s, i) => events.slice(s, starts[i + 1]));
}

/**
 * Founder-drawn boundaries (Studio's Reorganize surface) — the fully deterministic partition.
 * Unlike markers, this list is EXHAUSTIVE: every span between consecutive workflow-start ids is
 * exactly one workflow. A start id the timeline no longer contains is reported, never guessed at —
 * the caller surfaces it in the recording's notice. A cut at the first event collapses harmlessly
 * (that span exists anyway), so `[]` means one single workflow.
 */
export function partitionByStartIds(
  events: CapturedEvent[],
  startIds: string[],
): { spans: CapturedEvent[][]; unknownIds: string[] } {
  if (events.length === 0) return { spans: [], unknownIds: [...startIds] };
  const indexById = new Map(events.map((e, i) => [e.id, i]));
  const cuts = new Set<number>();
  const unknownIds: string[] = [];
  for (const id of startIds) {
    const i = indexById.get(id);
    if (i == null) unknownIds.push(id);
    else if (i > 0) cuts.add(i);
  }
  const starts = [0, ...[...cuts].sort((a, b) => a - b)];
  return { spans: starts.map((s, i) => events.slice(s, starts[i + 1])), unknownIds };
}

/**
 * Segment a recording whose workflow boundaries the FOUNDER drew (KnowledgeSource.boundaryOverrides).
 * Each span IS one workflow by construction — the per-span model call survives only to NAME it, and
 * any within-span split it proposes is collapsed (structure over prompt, the same rule that makes
 * markers hard cut points). No carry-forward is needed: spans partition the events exhaustively.
 */
export async function segmentWithBoundaries(
  openai: OpenAI,
  model: string,
  events: CapturedEvent[],
  boundaryEventIds: string[],
  narration: Map<string, string>,
  overallNarration = '',
): Promise<{ segments: Segment[]; unknownBoundaryIds: string[] }> {
  if (events.length === 0) return { segments: [], unknownBoundaryIds: [] };
  const { spans, unknownIds } = partitionByStartIds(events, boundaryEventIds);
  log.info(
    { boundaries: boundaryEventIds.length, spans: spans.map((s) => s.length), unknown: unknownIds.length },
    `founder boundaries — ${spans.length} workflow(s), exhaustive`,
  );
  const segments: Segment[] = [];
  for (const span of spans) {
    const proposed = await segmentSpan(openai, model, span, narration, overallNarration, {
      isSpan: spans.length > 1,
      titleBase: segments.length,
      exhaustive: true,
    });
    segments.push({
      title: proposed[0]?.title ?? `Workflow ${segments.length + 1}`,
      eventIds: span.map((e) => e.id),
    });
  }
  return { segments, unknownBoundaryIds: unknownIds };
}

/**
 * Split one recording's events into workflows: a deterministic partition at the user's markers
 * first, then one event-aware LLM pass PER SPAN (terminal-state driven; narration supporting). A
 * carry-forward guard then guarantees EVERY event lands in a workflow, so nothing is ever silently
 * dropped. See docs/build/kb-step-distillation.md.
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
  const spans = partitionByMarkers(events, markers);
  if (spans.length > 1) {
    log.info(
      { markers: markers.length, spans: spans.map((s) => s.length) },
      `partitioned at user markers into ${spans.length} spans — segmenting each separately`,
    );
  }

  const segments: Segment[] = [];
  for (const span of spans) {
    const spanSegments = await segmentSpan(openai, model, span, narration, overallNarration, {
      isSpan: spans.length > 1,
      titleBase: segments.length,
    });
    segments.push(...spanSegments);
  }
  return segments;
}

/** One LLM segmentation pass over one marker-delimited span (or the whole recording, unmarked). */
async function segmentSpan(
  openai: OpenAI,
  model: string,
  events: CapturedEvent[],
  narration: Map<string, string>,
  overallNarration: string,
  opts: { isSpan: boolean; titleBase: number; exhaustive?: boolean },
): Promise<Segment[]> {
  const allIds = events.map((e) => e.id);

  // Timeline — surface routes AND route transitions (the terminal-state signal) + narration.
  // Each line carries the event's timestamp: without it a long pause (a documented boundary signal)
  // is invisible to the model. (User markers used to ride this same clock as prompt lines; they are
  // now consumed structurally by partitionByMarkers, before any model call.)
  const timeline = events
    .map((ev) => {
      const n = narration.get(ev.id);
      const post = ev.postAction?.route?.path;
      const nav = post && post !== ev.route?.path ? ` -> ${post}` : '';
      return `- id=${ev.id} @ ${ev.t}ms | ${eventLabel(ev)}${nav}${n ? ` | said: "${n.slice(0, 160)}"` : ''}`;
    })
    .join('\n');

  const overall = overallNarration.trim().slice(0, 6000);
  const overallBlock = overall ? `Overall narration:\n"""${overall}"""\n\n` : '';

  // The model never learns about the other spans except through this note. Without it, an up-front
  // narration that enumerates tasks living in OTHER spans reads as workflows it must somehow
  // produce from THIS span's events. The EXHAUSTIVE note goes further, and its title demand is
  // load-bearing: the title is what the distiller prunes against ("drop actions that don't advance
  // the goal"), so a merged span titled after only its FIRST activity gets its second half pruned
  // as off-goal noise — the steps silently vanish (found live: a merged settings task kept 1 step).
  const spanNote = opts.exhaustive
    ? `NOTE: the author has marked these events as EXACTLY ONE workflow — return exactly ONE workflow containing EVERY event id. Title it by the overall goal of the WHOLE span: when it covers several activities, the title must name them together (e.g. "View projects and application settings"), never just the first. The overall narration may mention tasks that live outside this span.\n\n`
    : opts.isSpan
      ? `NOTE: these events are ONE author-delimited span of a longer recording — the author pressed "new workflow" at its edges, so the span's start and end are already correct boundaries. Segment only these events; the overall narration may mention tasks that live outside this span.\n\n`
      : '';

  const user = `${overallBlock}${spanNote}Events (in order):\n${timeline}\n\nReturn the workflows.`;

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
    title: (w.title || '').trim() || `Workflow ${opts.titleBase + i + 1}`,
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
