import OpenAI from 'openai';
import { redactText } from './redact';
import { structuredJsonCall } from './responses';
import type { DistilledStep } from './distill';

/**
 * Write ONE workflow's PLAN in prose — what the task achieves, what is optional, what has to be true
 * before you start.
 *
 * WHY THIS EXISTS AT ALL. A recording is a list of actions, so distilled steps can only ever say
 * what to click, in the order it was clicked. They structurally cannot express *"you only need one
 * of these"* — which is not a gap in the distiller's prompt but in the shape it must emit. In task
 * analysis the steps and the **plan** are two different artefacts for exactly this reason: the steps
 * come from watching, the plan comes from the person. Here the plan is in the narration, and this is
 * the only thing that reads it for that.
 *
 * The live failure it fixes: a chatbot workflow answered as ten mandatory steps when three of them
 * were "upload a document, or add a website URL, or both".
 *
 * WHY A SEPARATE CALL, AFTER DISTILLATION.
 *  · The distiller is good at producing clean steps; asking it to also write prose divides its
 *    attention on the thing it is already good at, and step quality is the foundation everything
 *    else stands on.
 *  · Writing this AFTER distillation means it sees the FINAL steps. It cannot describe a step that
 *    was dropped, and it cannot drift from wording that has already been settled.
 *  · It still needs the full transcript, because the plan is only ever in what the founder SAID.
 *    Steps alone would produce a summary of the clicks — which is the one thing already covered.
 *
 * Build-time only, once per workflow, never on the answer path.
 *
 * ⚠️ THIS IS MODEL OUTPUT ENTERING APPROVED KNOWLEDGE. Steps are anchored — every one cites a real
 * captured event, and the distiller is validated against those ids. Prose has no such anchor, which
 * is why Studio must show it wherever a workflow is approved. Without that, approval silently stops
 * covering everything the copilot may say.
 */

const MAX_TRANSCRIPT_CHARS = 6000; // matches the distiller's window
const MAX_DESCRIPTION_CHARS = 900; // a plan, not a retelling — see the prompt's length rule

const SYSTEM = `You write ONE short paragraph describing a product workflow, for an in-app help copilot that ALSO has the workflow's exact steps.

You get the workflow's title, its final user-facing steps, and the full narration transcript from the recording.

Describe the PLAN — what the user is accomplishing and how the parts relate:
- What the task achieves, in the user's own terms.
- What is OPTIONAL, what is a CHOICE between alternatives, and whether they may do more than one of them. This is the most valuable thing you can capture, and it is usually only in the narration ("you can either…", "or you can just…", "you don't have to…", "instead of that…").
- Anything required BEFORE starting, and anything that happens after (waiting, processing, a result to check).

Hard rules:
- NEVER restate a click target, a button name, a field name, or a step number. The copilot already has the steps and shows them separately. If your sentence could be mistaken for an instruction, rewrite it.
- Use ONLY the steps and the narration. NEVER add features, options, or behaviour from general knowledge about similar products — if the narration doesn't say it, it does not exist.
- If the narration reveals nothing beyond the steps themselves, write a plain one-sentence summary of the goal. A short honest description is correct; an invented one is not.
- Plain prose, no lists, no markdown, no heading. Two to four sentences.
- Write about the user ("you"), not about the recording.`;

const schema = {
  name: 'workflow_description',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { description: { type: 'string' } },
    required: ['description'],
  },
} as const;

/**
 * Returns the description, or `null` when there is nothing worth describing.
 *
 * Unlike the rest of the pipeline this is BEST-EFFORT and swallows its failure: a workflow without a
 * description is the status quo — steps still answer, exactly as they do today — so a model blip
 * must not fail a recording that otherwise processed perfectly. That is the opposite of the
 * distiller, where a silent failure would write a wrong knowledge base.
 */
export async function describeWorkflow(
  openai: OpenAI,
  model: string,
  title: string,
  steps: DistilledStep[],
  transcriptText: string,
): Promise<string | null> {
  if (steps.length === 0) return null;

  const stepList = steps
    .map((s, i) => `${i + 1}. ${s.instruction}${s.detail ? ` — ${s.detail}` : ''}`)
    .join('\n');
  const user = [
    `WORKFLOW: ${title}`,
    '',
    'STEPS (final, user-facing):',
    stepList,
    '',
    'NARRATION TRANSCRIPT:',
    transcriptText.trim().slice(0, MAX_TRANSCRIPT_CHARS) || '(none)',
  ].join('\n');

  try {
    const raw = await structuredJsonCall({
      openai,
      model,
      system: SYSTEM,
      user,
      schema: schema as unknown as { name: string; strict?: boolean; schema: Record<string, unknown> },
      stage: 'describe',
    });
    const parsed = JSON.parse(raw || '{}') as { description?: unknown };
    const text = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    if (!text) return null;
    // Redacted like every other authored string that can reach an end-user.
    return redactText(text.slice(0, MAX_DESCRIPTION_CHARS));
  } catch {
    return null;
  }
}
