import OpenAI from 'openai';
import type { Bbox, CapturedEvent } from '@sync/shared';
import { eventLabel } from './segment';
import { redactText } from './redact';

// KB step distillation — Phase 2 (LLM distillation "A").
// See docs/kb-step-distillation.md §5.3. Turns ONE workflow's (cleaned) events + narration into a
// short, clean, user-facing step list for the copilot: drops stray/orienting actions, merges
// low-level interactions, attributes narration, and keeps ONE curated screenshot + bbox per step.
// Text-based (no images): event labels + per-event narration + the full transcript are enough to
// pick real steps and the representative event. Raw events are NOT persisted — only these steps are.

/** What the model returns per step (grounding-rich, pre-resolution). */
export interface DistilledStepLLM {
  instruction: string;
  detail: string; // "" when none (strict schema requires it)
  route: string;
  sourceEventIds: string[]; // the real events this step merges (anti-hallucination)
  keyEventId: string; // the one event whose screen best represents the step
}

/** What we persist (into `KnowledgeItem.data`). No raw-event log — one curated visual per step. */
export interface DistilledStep {
  instruction: string;
  detail?: string;
  route: string;
  narration: string | null; // spoken "why" for this step (derived from its source events)
  screenshotFile: string | null; // resolved from keyEventId + frame rule C
  bbox?: Bbox; // keyEvent's element rect — powers the deferred highlight
}

const SYSTEM = `You convert ONE recorded product workflow into a short, clean, user-facing list of steps for an in-app help copilot.

You get the workflow's title, its captured interaction events in order (each with the element, the page route, any typed value, and the narration spoken around it), and the full narration transcript.

Produce the MINIMAL sequence of steps a user would actually follow to accomplish the task:
- DROP orienting/stray actions that don't advance the goal — e.g. clicking around the landing page, the logo, or a chat widget while explaining. The narration reveals intent ("this is the landing page" = not a step).
- MERGE low-level interactions into one user-facing step (focusing a field + typing = one "Enter your X" step; a button click that submits a form = one step).
- Write each instruction imperatively and concretely ("Click 'Sign In'", "Enter your email"). Put any helpful context in "detail" (else "").
- Preserve order.

Grounding (critical — do not violate):
- Use ONLY the provided events and narration. NEVER invent steps, UI, or values from general knowledge.
- For every step, "sourceEventIds" MUST list the real event id(s) it is built from, and "keyEventId" MUST be one id from that step's sourceEventIds — the event whose screen best represents the step.
- "route" is the page path the step happens on (copy it from the key event's route).
- Never output a step that has no real source event.`;

const schema = {
  name: 'distilled_workflow',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            instruction: { type: 'string' },
            detail: { type: 'string' },
            route: { type: 'string' },
            sourceEventIds: { type: 'array', items: { type: 'string' } },
            keyEventId: { type: 'string' },
          },
          required: ['instruction', 'detail', 'route', 'sourceEventIds', 'keyEventId'],
        },
      },
    },
    required: ['steps'],
  },
} as const;

/** Join the unique narration spoken across a step's source events (the smear self-corrects once merged). */
function stepNarration(sourceIds: string[], narration: Map<string, string>): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const id of sourceIds) {
    const n = narration.get(id);
    if (n && !seen.has(n)) {
      seen.add(n);
      parts.push(n);
    }
  }
  const joined = parts.join(' ').trim();
  return joined ? redactText(joined) : null;
}

/** Frame rule C: action frame by default; the result (post) frame for the workflow's last/outcome step. */
function resolveScreenshot(ev: CapturedEvent, useResultFrame: boolean): string | null {
  if (useResultFrame) {
    const post = ev.postAction?.screenshot?.file;
    if (post) return post; // the "you landed here" payoff frame
  }
  return ev.screenshot?.file ?? null;
}

function resolveStep(
  s: DistilledStepLLM,
  sourceIds: string[],
  keyEvent: CapturedEvent,
  narration: Map<string, string>,
): DistilledStep {
  const detail = (s.detail ?? '').trim();
  return {
    instruction: redactText((s.instruction ?? '').trim()),
    detail: detail ? redactText(detail) : undefined,
    route: ((s.route || keyEvent.route?.path) ?? '').trim(),
    narration: stepNarration(sourceIds, narration),
    screenshotFile: resolveScreenshot(keyEvent, false),
    bbox: keyEvent.target?.bbox,
  };
}

/** Never lose a workflow: 1 step per cleaned event, grounded directly in capture. */
function fallbackStep(ev: CapturedEvent, narration: Map<string, string>): DistilledStep {
  const n = narration.get(ev.id) ?? null;
  return {
    instruction: redactText(eventLabel(ev)),
    route: ev.route?.path ?? '',
    narration: n ? redactText(n) : null,
    screenshotFile: resolveScreenshot(ev, false),
    bbox: ev.target?.bbox,
  };
}

/** Searchable text for a distilled step (instruction + detail + narration). Used by the worker for `KnowledgeItem.text`. */
export function distilledStepText(step: DistilledStep): string {
  return [step.instruction, step.detail, step.narration].filter(Boolean).join(' — ');
}

/**
 * Distill one workflow's events into clean, ordered, user-facing steps with a curated screenshot each.
 * Pure aside from the single LLM call; `temperature: 0` for stability. Validates the model's grounding
 * (every step must cite known event ids) and falls back to the cleaned events if it returns nothing.
 */
export async function distillSteps(
  openai: OpenAI,
  model: string,
  workflowTitle: string,
  events: CapturedEvent[],
  narration: Map<string, string>,
  transcriptText = '',
): Promise<DistilledStep[]> {
  if (events.length === 0) return [];
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const known = new Set(eventsById.keys());

  const timeline = events
    .map((ev) => {
      const n = narration.get(ev.id);
      const post = ev.postAction?.route?.path;
      const nav = post && post !== ev.route?.path ? ` -> navigates to ${post}` : '';
      return (
        `- id=${ev.id} | ${eventLabel(ev)}` +
        (ev.value ? ` | typed: "${ev.value}"` : '') +
        nav +
        (n ? ` | said: "${n.slice(0, 200)}"` : '')
      );
    })
    .join('\n');

  const overall = transcriptText.trim().slice(0, 6000);
  const overallBlock = overall ? `Full narration:\n"""${overall}"""\n\n` : '';
  const user = `Workflow: "${workflowTitle}"\n\n${overallBlock}Events (in order):\n${timeline}\n\nReturn the distilled steps.`;

  const res = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: schema as any },
  });

  const content = res.choices[0]?.message?.content ?? '{"steps":[]}';
  let parsed: { steps?: DistilledStepLLM[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { steps: [] };
  }

  // Resolve + validate each model step; keep the key event so we can switch the last step's frame.
  const built: { step: DistilledStep; keyEvent: CapturedEvent }[] = [];
  for (const s of parsed.steps ?? []) {
    const sourceIds = (s.sourceEventIds ?? []).filter((id) => known.has(id));
    if (sourceIds.length === 0) continue; // guardrail: drop ungrounded (hallucinated) steps
    const keyId = known.has(s.keyEventId) ? s.keyEventId : sourceIds[sourceIds.length - 1]!;
    const keyEvent = eventsById.get(keyId)!;
    built.push({ step: resolveStep(s, sourceIds, keyEvent, narration), keyEvent });
  }

  // Fallback — never lose a workflow.
  const final =
    built.length > 0 ? built : events.map((ev) => ({ step: fallbackStep(ev, narration), keyEvent: ev }));

  // Frame rule C: the last/outcome step shows the result frame of its key event.
  const last = final[final.length - 1];
  if (last) last.step.screenshotFile = resolveScreenshot(last.keyEvent, true);

  return final.map((b) => b.step);
}
