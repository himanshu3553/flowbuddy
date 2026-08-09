import OpenAI from 'openai';
import type { Bbox, CapturedEvent } from '@flowbuddy/shared';
import { eventLabel } from './segment';
import { redactText } from './redact';
import { structuredJsonCall } from './responses';

// KB step distillation — Phase 2 (LLM distillation "A").
// See docs/build/kb-step-distillation.md §5.3. Turns ONE workflow's (cleaned) events + narration into a
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
  // P2 Sense — the manifest event this step's screen came from, so the sense plan (and later the
  // Phase-3/4 execution plan) can recover the event's ranked locators WITHOUT re-matching by
  // screenshot. Additive: pre-Sense rows lack it and fall back to screenshotFile matching.
  keyEventId?: string;
}

const SYSTEM = `You convert ONE recorded product workflow into a short, clean, user-facing list of steps for an in-app help copilot.

You get the workflow's title, its captured interaction events in order (each with the element, the page route, what was done to it, and the narration spoken around it), and the full narration transcript.

Produce the MINIMAL sequence of steps a user would actually follow to accomplish the task:
- DROP orienting/stray actions that don't advance the goal — e.g. clicking around the landing page, the logo, or a chat widget while explaining. The narration reveals intent ("this is the landing page" = not a step).
- MERGE low-level interactions into one user-facing step (focusing a field + typing = one "Enter your X" step; a button click that submits a form = one step).
- Write each instruction imperatively and concretely ("Click 'Sign In'", "Enter your email"). Put any helpful context in "detail" (else "").
- Preserve order.

Reading an element's description:
- \`click "Save"\` — the quoted text is the element's real label. Use it.
- \`input placeholder "My Website Chatbot"\` — there is NO label; that is the EXAMPLE text the product shows inside the empty field. It tells you what the field is FOR, and it is never something to enter. A field with placeholder "My Website Chatbot" is the project-name field; one with placeholder "AI Assistant" is the bot-name field. Two fields with different placeholders are two DIFFERENT fields and need two steps — never merge them.
- \`<input>\` — no label and no placeholder; identify it from the narration and its surroundings.

You are writing for SOMEONE ELSE'S account, not describing the recording:
- "entered: <...>" stands for text the recorder typed into a field. It is their own sample data. Say what the reader must supply, taking the wording from the field's own name or placeholder — "Enter your project name", "Upload a PDF". NEVER invent a specific value to put there.
- "selected: X" is an option the product itself offers, so naming it is allowed. Name it when it is part of THIS task ("Choose the Website URL tab"). When it is a personal preference — a country, a plan, a theme, a language — say what to choose, not what the recorder chose.
- "toggled" means a checkbox or switch was used. THE RECORDING DOES NOT CAPTURE WHETHER IT ENDED ON OR OFF. So never state a position unless the narration states one. Read the narration:
  · It marks the reader's own decision ("you can enable or disable this", "for now I'm just keeping it on") → write the DECISION and what it changes: "Decide whether to enable general-knowledge responses — with them on, the bot also answers from its own knowledge." NEVER the recorder's position.
  · It marks a requirement, or the control is plainly required (accepting terms) → write the required action: "Accept the terms and conditions."
  · It says nothing → write the neutral action for the control the element name describes.
- NEVER write "Keep X enabled", "Leave X as is", or "Keep the default" — that describes the recording rather than instructing the reader.

Grounding (critical — do not violate):
- Use ONLY the provided events and narration. NEVER invent steps, UI, or behaviour from general knowledge — and never reproduce the recorder's sample values either.
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

/**
 * What a recorded value actually IS — the difference between the task and the recorder.
 *
 * THE BUG THIS EXISTS TO END. The timeline used to hand the model every captured value verbatim
 * (`typed: "Test 123"`) beside a prompt rule reading "NEVER invent values", so it dutifully baked the
 * recorder's own sample data into the instruction: *Enter "Test 123" in the project name field*. The
 * copilot then read that out to the customer as though it were the task. Worse, `maskValue`
 * (extension/content.ts) masks by input TYPE — password and email become `••••••`, a plain text field
 * does not — so a real person's name typed into a signup form became copilot-speakable content.
 *
 * `content` is therefore the FAIL-SAFE default: an unrecognised control's value is treated as the
 * recorder's own and never reproduced. A missed generalisation costs one vague step; a missed
 * redaction puts someone's data in front of an end user.
 */
type ValueKind =
  /** The recorder supplied it. Never reproduced — only its shape is described. */
  | 'content'
  /** Chosen from a set the PRODUCT offers, so naming it is not inventing. */
  | 'choice'
  /** A checkbox or radio, whose real state we do not capture at all (see `valueHint`). */
  | 'unknown-state';

function valueKind(ev: CapturedEvent): ValueKind {
  const tag = (ev.target?.tag ?? '').toLowerCase();
  const type = (ev.target?.attributes?.type ?? '').toLowerCase();
  if (tag === 'select') return 'choice';
  if (type === 'checkbox' || type === 'radio') return 'unknown-state';
  if (type === 'range') return 'choice'; // a position on a scale the product defines
  return 'content'; // textarea and every free-text input type — and anything unrecognised
}

/** The kind of thing that goes in a free-text field, without the thing itself. */
function contentShape(ev: CapturedEvent, value: string): string {
  const type = (ev.target?.attributes?.type ?? '').toLowerCase();
  if (type === 'file') {
    // Keep the EXTENSION, drop the filename: that the product took a .pdf is a fact about the
    // product; that it was called Hotel.pdf is a fact about the recorder.
    const ext = /\.([a-z0-9]{1,6})$/i.exec(value.trim())?.[1];
    return ext ? `<a .${ext.toLowerCase()} file>` : '<a file>';
  }
  if (type === 'email') return '<an email address>';
  if (type === 'url') return '<a web address>';
  if (type === 'password') return '<a password>';
  if (type === 'tel') return '<a phone number>';
  if (type === 'number') return '<a number>';
  if (type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week' || type === 'time') {
    return '<a date>';
  }
  return '<text>';
}

/**
 * What the model is told about a value — never the value itself unless the product supplied it.
 *
 * The `unknown-state` case is not caution, it is accuracy: the recorder captures `el.value`, and for
 * a checkbox that is the value ATTRIBUTE — literally the string "on" whether the box was ticked or
 * cleared. Passing it through told the model it knew a state it has never had, which is how "for now
 * I'm just keeping it enabled" became the instruction *Keep general knowledge responses enabled*.
 * Reporting the interaction without a position leaves the narration as the only source for one, which
 * is the only honest place it can come from.
 */
export function valueHint(ev: CapturedEvent): string {
  const kind = valueKind(ev);
  if (kind === 'unknown-state') return ' | toggled';
  const value = (ev.value ?? '').trim();
  if (!value) return '';
  if (kind === 'choice') return ` | selected: "${value.slice(0, 80)}"`;
  return ` | entered: ${contentShape(ev, value)}`;
}

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
    // From the anchored key event, NEVER from the model. `route` was the one field that escaped
    // the event-id grounding — the prompt says "copy it from the key event" but a plausible
    // rewrite (/project/ for /projects/) was persisted as if anchored, then fed the sense probe,
    // retrieval's route boost, the walkthrough and displayRoute. The model still emits `route`
    // (strict schema); it is advisory only.
    route: (keyEvent.route?.path ?? '').trim(),
    narration: stepNarration(sourceIds, narration),
    screenshotFile: resolveScreenshot(keyEvent, false),
    bbox: keyEvent.target?.bbox,
    keyEventId: keyEvent.id,
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
    keyEventId: ev.id,
  };
}

/** Searchable text for a distilled step (instruction + detail + narration). Used by the worker for `KnowledgeItem.text`. */
export function distilledStepText(step: DistilledStep): string {
  return [step.instruction, step.detail, step.narration].filter(Boolean).join(' — ');
}

/**
 * Distill one workflow's events into clean, ordered, user-facing steps with a curated screenshot each.
 * Pure aside from the single LLM call. Validates the model's grounding
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
        valueHint(ev) +
        nav +
        (n ? ` | said: "${n.slice(0, 200)}"` : '')
      );
    })
    .join('\n');

  const overall = transcriptText.trim().slice(0, 6000);
  const overallBlock = overall ? `Full narration:\n"""${overall}"""\n\n` : '';
  const user = `Workflow: "${workflowTitle}"\n\n${overallBlock}Events (in order):\n${timeline}\n\nReturn the distilled steps.`;

  const raw = await structuredJsonCall({
    openai,
    model,
    system: SYSTEM,
    user,
    schema,
    stage: 'distillation',
  });

  const content = raw || '{"steps":[]}';
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
