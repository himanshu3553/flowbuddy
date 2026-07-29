/**
 * Segmentation drift harness — run the segmenter N times over a REAL stored recording and compare
 * the workflow boundaries it produces.
 *
 * WHY THIS EXISTS. Segmentation ("one task = one workflow") used to be pinned at `temperature: 0`,
 * so re-processing a recording produced the same boundaries every time. Reasoning models reject an
 * explicit temperature, so that guarantee is gone — boundaries can now differ between runs of
 * identical code. This measures how much, which is the only honest way to tell a real regression
 * (a prompt or model change made segmentation worse) from noise (it was always going to vary).
 *
 * WHY IT IS READ-ONLY, AND MUST STAY THAT WAY. The obvious way to test this is Studio's
 * "Re-process", but that writes: it deletes and recreates every `KnowledgeItem`. `CopilotApproval`
 * is keyed on `(sourceId, segmentIndex)` so approval deliberately SURVIVES that rebuild — which is
 * correct while boundaries are stable, and dangerous now that they are not. If a reprocess splits
 * differently, `segmentIndex 0` becomes a DIFFERENT workflow and the founder's approval silently
 * follows the index onto content nobody reviewed. Approval is the product's trust boundary; it must
 * not move quietly. So this harness touches nothing: it reads the stored manifest and transcript,
 * runs the same pipeline stages in memory, and prints.
 *
 * It re-uses the PERSISTED transcript rather than re-transcribing, so runs cost only the
 * segmentation call and are comparable to each other (alignment and cleanup are deterministic).
 *
 * Usage — from the repo root:
 *   pnpm --filter @flowbuddy/api exec tsx ../../scripts/segmentation-drift.ts [--runs 3] [--session <id>]
 *
 * With no --session it picks the most recent `ready` recording. Needs the same OPENAI_API_KEY and
 * DATABASE_URL the worker uses.
 */
import 'dotenv/config';
import OpenAI from 'openai';
import { prisma } from '@flowbuddy/db';
import { alignNarration, cleanEvents, segment, type Transcript } from '@flowbuddy/synthesis';
import type { SessionManifest } from '@flowbuddy/shared';

const arg = (name: string, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const runs = Number(arg('runs', '3'));
const model = process.env.SYNTH_MODEL || 'gpt-5.6-sol';

/** The comparable shape of one run: how many workflows, their titles, and where the cuts fell. */
const shapeOf = (segs: Array<{ title: string; eventIds: string[] }>) =>
  segs.map((s) => `${s.title} [${s.eventIds.length}]`).join('  |  ');

async function main() {
  const where = arg('session') ? { id: arg('session') } : { status: 'ready' as const };
  const rec = await prisma.knowledgeSource.findFirst({ where, orderBy: { createdAt: 'desc' } });
  if (!rec?.manifest) throw new Error('No processed recording with a stored manifest was found.');

  const manifest = rec.manifest as unknown as SessionManifest;
  const transcript = (rec.transcript ?? { text: '', segments: [] }) as unknown as Transcript;
  const cleaned = cleanEvents(manifest.events);
  const narration = alignNarration(manifest.events, transcript);

  console.log(`recording ${rec.id} · ${manifest.events.length} events → ${cleaned.length} cleaned · model ${model}`);
  if (cleaned.length < 2) console.log('⚠️  too few events to segment meaningfully — drift here proves nothing.');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const shapes: string[] = [];
  for (let i = 0; i < runs; i++) {
    const segs = await segment(openai, model, cleaned, manifest.markers ?? [], narration, transcript.text);
    const shape = shapeOf(segs);
    shapes.push(shape);
    console.log(`  run ${i + 1}: ${segs.length} workflow(s) — ${shape}`);
  }

  const distinct = [...new Set(shapes)];
  console.log(
    runs < 2
      ? // One sample cannot show stability. Saying so beats a green tick that means nothing —
        // this harness exists to measure variance, and variance needs more than one observation.
        `\n· one run only — ran clean, but proves nothing about drift. Use --runs 3 or more.`
      : distinct.length === 1
        ? `\n✅ stable across ${runs} runs — identical boundaries every time`
        : `\n⚠️  DRIFT: ${distinct.length} different segmentations across ${runs} runs\n${distinct.map((d, i) => `   ${i + 1}. ${d}`).join('\n')}`,
  );
  // A single workflow cannot drift, so a clean result on a one-task recording says nothing. Say so
  // rather than letting a green tick be mistaken for evidence.
  if (distinct.length === 1 && shapes[0] && !shapes[0].includes('|')) {
    console.log('   (…but this recording holds ONE workflow — there are no boundaries to get wrong.)');
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
