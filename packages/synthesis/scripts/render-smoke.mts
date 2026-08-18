/* Render smoke test: synthetic app screenshots + silent narration → mp4. No network. */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildVideoPlan } from '../src/video-plan';
import { renderVideo } from '../src/video-render';
import { assembleTimeline, silentWav } from '../src/video-audio';

const VIEW = { w: 1280, h: 800 };
const DPR = 2;

function fakeAppShot(label: string, accent: string, highlightBtn: boolean): Promise<Buffer> {
  const w = VIEW.w * DPR;
  const h = VIEW.h * DPR;
  const svg = `<svg width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#f6f7f9"/>
    <rect width="${w}" height="${120 * DPR / 2}" fill="#ffffff" stroke="#eceef3"/>
    <rect x="${40 * DPR}" y="${16 * DPR}" width="${120 * DPR}" height="${28 * DPR}" rx="${6 * DPR}" fill="${accent}"/>
    <rect x="0" y="${60 * DPR}" width="${220 * DPR}" height="${h}" fill="#ffffff" stroke="#eceef3"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${24 * DPR}" y="${(90 + i * 44) * DPR}" width="${170 * DPR}" height="${20 * DPR}" rx="${4 * DPR}" fill="#eceef3"/>`).join('')}
    <text x="${280 * DPR}" y="${140 * DPR}" font-family="Helvetica" font-size="${34 * DPR}" fill="#14161f">${label}</text>
    <rect x="${280 * DPR}" y="${180 * DPR}" width="${700 * DPR}" height="${240 * DPR}" rx="${10 * DPR}" fill="#ffffff" stroke="#d8dbe4"/>
    <rect x="${310 * DPR}" y="${215 * DPR}" width="${420 * DPR}" height="${22 * DPR}" rx="${4 * DPR}" fill="#eceef3"/>
    <rect x="${310 * DPR}" y="${255 * DPR}" width="${560 * DPR}" height="${22 * DPR}" rx="${4 * DPR}" fill="#eceef3"/>
    <rect x="${310 * DPR}" y="${330 * DPR}" width="${140 * DPR}" height="${44 * DPR}" rx="${8 * DPR}" fill="${highlightBtn ? '#3b50e0' : '#eceef3'}"/>
    <text x="${330 * DPR}" y="${358 * DPR}" font-family="Helvetica" font-size="${18 * DPR}" fill="${highlightBtn ? '#ffffff' : '#6b7180'}">Save</text>
    <rect x="${(VIEW.w / 2 - 160) * DPR}" y="${(VIEW.h - 60) * DPR}" width="${320 * DPR}" height="${40 * DPR}" rx="${20 * DPR}" fill="#dddddd"/>
    <text x="${(VIEW.w / 2 - 120) * DPR}" y="${(VIEW.h - 34) * DPR}" font-family="Helvetica" font-size="${16 * DPR}" fill="#3a3f4d">RECORDER BAR (must be cropped)</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

const steps = [
  { caption: 'Open the Team settings page from the sidebar', bbox: { x: 24, y: 178, w: 170, h: 20 }, hasPost: true },
  { caption: 'Fill in the new teammate’s email address', bbox: { x: 310, y: 215, w: 420, h: 22 }, hasPost: false },
  { caption: 'Click Save to send the invitation', bbox: { x: 310, y: 330, w: 140, h: 44 }, hasPost: true },
];

const clips = [2600, 3100, 2800];
const plan = buildVideoPlan({
  title: 'Invite a teammate to your workspace',
  introAudioMs: 1800,
  outroAudioMs: 1500,
  steps: steps.map((s, i) => ({ caption: s.caption, audioMs: clips[i]!, bbox: s.bbox, viewport: VIEW, hasPostFrame: s.hasPost })),
});

const frames = await Promise.all(
  steps.map(async (s, i) => ({
    action: await fakeAppShot(`Screen ${i + 1}: before`, '#3b50e0', i === 2),
    post: s.hasPost ? await fakeAppShot(`Screen ${i + 1}: AFTER the click`, '#1aa86a', false) : null,
    viewport: VIEW,
  })),
);

const stepSegs = plan.segments.filter((s) => s.kind === 'step') as Array<{ audioStartMs: number; index: number }>;
const audio = assembleTimeline(
  [
    { atMs: plan.segments[0]!.audioStartMs, wav: silentWav(1800) },
    ...stepSegs.map((seg) => ({ atMs: seg.audioStartMs, wav: silentWav(clips[seg.index]!) })),
    { atMs: plan.segments[plan.segments.length - 1]!.audioStartMs, wav: silentWav(1500) },
  ],
  plan.totalMs,
);

console.log(`plan: ${plan.totalMs}ms, ${plan.segments.length} segments`);
const t0 = Date.now();
const { mp4, durationMs } = await renderVideo({
  plan,
  steps: frames,
  audio,
  onProgress: (f, total) => process.stdout.write(`\r${f}/${total} frames`),
});
console.log(`\nrendered ${durationMs}ms of video in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(mp4.length / 1e6).toFixed(1)}MB`);
await writeFile(new URL('./smoke.mp4', import.meta.url), mp4);
