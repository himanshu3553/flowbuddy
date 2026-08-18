/**
 * The demo-video builder — the third derivation of a recording, beside the KB build and
 * the execution plan: an approved workflow's distilled steps + stored frames + one
 * script/TTS pass in, a polished branded MP4 out. Orchestration only; the decisions
 * live in the parts (script grounding in video-script.ts, timing/camera in
 * video-plan.ts, pixels in video-render.ts, audio in video-audio.ts), each testable
 * alone. I/O is injected (`getArtifact`) so this package stays storage-agnostic.
 *
 * Frame selection per step: the ACTION frame is the step's own curated screenshot
 * (distillation's "frame rule C" already picked it); the RESULT frame is the key
 * event's post-action screenshot when it exists and differs — the video clicks, then
 * shows what happened, which is the single biggest lift over a slideshow. A step whose
 * screenshot is missing from storage holds the previous step's last frame (narration
 * carries it) rather than dying: one lost JPEG should not kill a whole render.
 */
import OpenAI from 'openai';
import type { CapturedEvent, SessionManifest } from '@flowbuddy/shared/capture';
import { assembleTimeline, parseWav, silentWav, synthesizeSpeech, type TtsClip } from './video-audio';
import { buildVideoPlan, type StepSegment, type VideoPlanStepInput } from './video-plan';
import { renderVideo, type StepFrames } from './video-render';
import { writeVideoScript } from './video-script';

const TTS_TIMEOUT_MS = 120_000;

export interface DemoVideoStepInput {
  instruction: string;
  detail?: string | null;
  narration?: string | null;
  screenshotFile?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  keyEventId?: string | null;
}

export interface DemoVideoInput {
  apiKey: string;
  /** Script model (SYNTH_MODEL) and TTS model/voice — see .env.example. */
  scriptModel: string;
  ttsModel: string;
  ttsVoice: string;
  title: string;
  description?: string | null;
  steps: DemoVideoStepInput[];
  manifest: SessionManifest;
  getArtifact: (relPath: string) => Promise<Buffer | null>;
  log?: { info: (o: object, msg: string) => void; warn: (o: object, msg: string) => void };
  onProgress?: (renderedFrames: number, totalFrames: number) => void;
}

export interface DemoVideoResult {
  mp4: Buffer;
  durationMs: number;
  /** True when one or more TTS clips failed and were replaced with silence. */
  degradedAudio: boolean;
}

export async function buildDemoVideo(input: DemoVideoInput): Promise<DemoVideoResult> {
  if (input.steps.length === 0) throw new Error('demo-video: workflow has no steps');
  const log = input.log ?? { info: () => {}, warn: () => {} };
  const openai = new OpenAI({ apiKey: input.apiKey, timeout: TTS_TIMEOUT_MS, maxRetries: 1 });

  // 1. Script — one grounded structured call.
  const script = await writeVideoScript({
    openai,
    model: input.scriptModel,
    title: input.title,
    description: input.description,
    steps: input.steps,
  });

  // 2. Voiceover — sequential on purpose: the clips are small, and the worker shares
  // an instance with the API, so a parallel burst buys seconds at the cost of spikes.
  let degradedAudio = false;
  let clipRate: number | null = null;
  const speak = async (text: string, label: string): Promise<TtsClip> => {
    try {
      const clip = await synthesizeSpeech({ openai, model: input.ttsModel, voice: input.ttsVoice, text });
      clipRate = clipRate ?? parseWav(clip.wav).sampleRate;
      return clip;
    } catch (err) {
      degradedAudio = true;
      log.warn({ label, err: err instanceof Error ? err.message : String(err) }, 'demo-video: TTS failed, using silence');
      return { wav: silentWav(2000, clipRate ?? 24000), durationMs: 2000 };
    }
  };
  const introClip = await speak(script.intro, 'intro');
  const stepClips: TtsClip[] = [];
  for (let i = 0; i < script.steps.length; i++) stepClips.push(await speak(script.steps[i]!, `step-${i + 1}`));
  const outroClip = await speak(script.outro, 'outro');

  // 3. Frames — action from the step's curated screenshot, result from the key
  // event's post-action frame when it is a genuinely different image.
  const eventById = new Map<string, CapturedEvent>();
  for (const e of input.manifest.events ?? []) eventById.set(e.id, e);
  const viewport = input.manifest.app?.viewport ?? { w: 1280, h: 800 };

  const frames: StepFrames[] = [];
  const planSteps: VideoPlanStepInput[] = [];
  let lastGood: Buffer | null = null;
  const missing: number[] = [];
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i]!;
    const audioMs = stepClips[i]!.durationMs;
    const action = step.screenshotFile ? await input.getArtifact(step.screenshotFile) : null;
    const keyEvent = step.keyEventId ? eventById.get(step.keyEventId) : undefined;
    const postFile = keyEvent?.postAction?.screenshot?.file;
    const post = postFile && postFile !== step.screenshotFile ? await input.getArtifact(postFile) : null;
    if (!action && !lastGood) {
      missing.push(i);
      frames.push(null as unknown as StepFrames); // back-filled below from the first good frame
      planSteps.push({ caption: step.instruction, audioMs, bbox: null, viewport, hasPostFrame: false });
      continue;
    }
    const actionBuf: Buffer = action ?? lastGood!;
    lastGood = post ?? actionBuf;
    frames.push({ action: actionBuf, post, viewport });
    planSteps.push({
      caption: step.instruction,
      audioMs,
      // Only point at the target when we're showing the step's own frame.
      bbox: action ? step.bbox ?? null : null,
      viewport,
      hasPostFrame: Boolean(post),
    });
  }
  const firstGood = frames.find((f) => f !== null);
  if (!firstGood) throw new Error('demo-video: no step screenshots found in storage');
  for (const i of missing) frames[i] = { action: firstGood.action, viewport, post: null };
  if (missing.length > 0) log.warn({ steps: missing.map((i) => i + 1) }, 'demo-video: steps missing screenshots, holding neighbor frame');

  // 4. Plan, then the audio timeline aligned to it.
  const plan = buildVideoPlan({
    title: input.title,
    introAudioMs: introClip.durationMs,
    outroAudioMs: outroClip.durationMs,
    steps: planSteps,
  });
  const stepSegments = plan.segments.filter((s): s is StepSegment => s.kind === 'step');
  const audio = assembleTimeline(
    [
      { atMs: plan.segments[0]!.audioStartMs, wav: introClip.wav },
      ...stepSegments.map((seg) => ({ atMs: seg.audioStartMs, wav: stepClips[seg.index]!.wav })),
      { atMs: plan.segments[plan.segments.length - 1]!.audioStartMs, wav: outroClip.wav },
    ],
    plan.totalMs,
  );

  log.info({ steps: input.steps.length, totalMs: plan.totalMs, degradedAudio }, 'demo-video: rendering');

  // 5. Pixels.
  const { mp4, durationMs } = await renderVideo({ plan, steps: frames, audio, onProgress: input.onProgress });
  return { mp4, durationMs, degradedAudio };
}
