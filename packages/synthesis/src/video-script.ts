/**
 * The demo-video voiceover script: one structured call, grounded ONLY in the approved
 * workflow's own content (title, description, step instructions, and the founder's
 * spoken narration where it exists). The same trust posture as the rest of the
 * pipeline — the script may rephrase what the workflow says, never add product claims,
 * outcomes, or UI the steps don't contain.
 *
 * MAX_NARRATION_CHARS keeps a single step's line inside ~12s of speech so the step
 * segment (whose length is driven by the measured audio) stays watchable; the schema
 * asks for brevity and the code enforces it, because a schema description is a request,
 * not a guarantee.
 */
import type OpenAI from 'openai';
import { structuredJsonCall } from './responses';

const MAX_NARRATION_CHARS = 280;
const MAX_CARD_CHARS = 220;

export interface VideoScriptStepInput {
  instruction: string;
  detail?: string | null;
  narration?: string | null;
}

export interface VideoScript {
  intro: string;
  outro: string;
  steps: string[];
}

const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

export async function writeVideoScript(opts: {
  openai: OpenAI;
  model: string;
  title: string;
  description?: string | null;
  steps: VideoScriptStepInput[];
}): Promise<VideoScript> {
  const stepCount = opts.steps.length;
  const schema = {
    name: 'demo_video_script',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['intro', 'steps', 'outro'],
      properties: {
        intro: {
          type: 'string',
          description: 'One or two spoken sentences introducing what this demo shows. No greetings like "hello everyone", no "in this video I will".',
        },
        steps: {
          type: 'array',
          minItems: stepCount,
          maxItems: stepCount,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['narration'],
            properties: {
              narration: {
                type: 'string',
                description: 'One or two short spoken sentences for this step, present tense, second person ("you"). Describe the action and, when the step content says so, why it matters. Never invent UI, results, or product claims.',
              },
            },
          },
        },
        outro: {
          type: 'string',
          description: 'One short closing sentence wrapping up what was shown.',
        },
      },
    },
  };

  const stepsBlock = opts.steps
    .map((s, i) => {
      const lines = [`Step ${i + 1}: ${s.instruction}`];
      if (s.detail) lines.push(`  Context: ${s.detail}`);
      if (s.narration) lines.push(`  The founder said while recording: "${s.narration}"`);
      return lines.join('\n');
    })
    .join('\n');

  const system = [
    'You write voiceover scripts for short, polished software product demo videos.',
    'The script must be grounded ONLY in the workflow content provided — you may rephrase and smooth it, but never add features, UI elements, numbers, or outcomes it does not state.',
    'Tone: calm, confident, plain language. No hype words, no filler, no step numbers spoken aloud, no "as you can see".',
    'Each step narration is read while that step is on screen, so keep every line short enough to speak in a few seconds.',
  ].join('\n');

  const user = [
    `Workflow title: ${opts.title}`,
    opts.description ? `What this workflow is: ${opts.description}` : null,
    '',
    'Steps:',
    stepsBlock,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const raw = await structuredJsonCall({
    openai: opts.openai,
    model: opts.model,
    system,
    user,
    schema,
    stage: 'video-script',
  });

  const parsed = JSON.parse(raw) as { intro: string; outro: string; steps: Array<{ narration: string }> };
  if (!Array.isArray(parsed.steps) || parsed.steps.length !== stepCount) {
    throw new Error(`video-script: expected ${stepCount} step narrations, got ${parsed.steps?.length ?? 0}`);
  }
  return {
    intro: truncate(parsed.intro.trim(), MAX_CARD_CHARS),
    outro: truncate(parsed.outro.trim(), MAX_CARD_CHARS),
    steps: parsed.steps.map((s) => truncate(s.narration.trim(), MAX_NARRATION_CHARS)),
  };
}
