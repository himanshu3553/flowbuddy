/**
 * The demo-video RENDERER — a dumb executor of `video-plan.ts`. It owns pixels only:
 * every duration, camera position and cursor coordinate comes from the plan, already
 * unit-tested; nothing here decides timing.
 *
 * Pipeline: per-step "card" images are pre-built (screenshot → control-bar crop →
 * rounded corners → border → baked drop shadow on transparent padding), then a frame
 * loop samples the plan at 30fps, extracts the camera's visible window from the card,
 * composites overlays (highlight ring, cursor, click ripple, caption pill), and streams
 * raw RGBA into ffmpeg (`ffmpeg-static` — no system install needed on dev machines or
 * in the node:22-slim worker image) alongside the assembled WAV voiceover.
 *
 * MEMORY. The worker shares a 512MB instance with the API, so nothing holds all frames
 * or all decoded cards at once: card images are stored as PNG (compressed) and decoded
 * to raw RGBA per segment, evicted when the segment advances; frames stream straight
 * into ffmpeg's stdin with backpressure honored.
 *
 * Look constants (this header is their home): dark studio backdrop with an indigo glow,
 * white caption pill — the palette hexes mirror docs/design_system/tokens/colors.css,
 * which OWNS them; change there first. CARD_MAX_W caps decoded card width: at max zoom
 * (1.6×) the camera needs ~2700 source px across, so anything larger only burns memory.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import {
  CONTROLBAR_CROP_CSS_PX,
  sampleCamera,
  sampleCursor,
  type StepSegment,
  type VideoPlan,
  type VideoSegment,
} from './video-plan';
import { fitText, textPath, wrapText } from './video-text';

// Mirrors docs/design_system/tokens/colors.css — that file owns every hex.
const INDIGO_400 = '#4a63e8';
const INDIGO_600 = '#3a50dd';
const INDIGO_200 = '#c3ccfb';
const INK = '#14161f';
const CODE_BG = '#1f2330';
const GRAY_150 = '#e6e8ee';
const WHITE = '#ffffff';

const STAGE_MARGIN_X = 110;
const STAGE_MARGIN_TOP = 64;
const CAPTION_CLEARANCE = 176;
const CARD_RADIUS = 22;
const CARD_SHADOW_PAD = 90;
const CARD_MAX_W = 2720;
const CAPTION_H = 88;
const CAPTION_MAX_W = 1560;
const CAPTION_FADE_MS = 280;
const POST_FADE_MS = 260;
const RIPPLE_MS = 450;
const CURSOR_SIZE = 30;
const HIGHLIGHT_FADE_IN_MS = 150;
const HIGHLIGHT_FADE_OUT_MS = 500;

export interface StepFrames {
  action: Buffer;
  post?: Buffer | null;
  /** Recorded viewport in CSS px, for the control-bar crop. */
  viewport: { w: number; h: number };
}

export interface RenderVideoInput {
  plan: VideoPlan;
  /** Aligned with the plan's step segments by `index`. */
  steps: StepFrames[];
  /** One WAV covering the whole timeline (see video-audio.ts `assembleTimeline`). */
  audio: Buffer;
  onProgress?: (renderedFrames: number, totalFrames: number) => void;
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

interface CardImage {
  png: Buffer;
  width: number;
  height: number;
  /** Content (screenshot) rect inside the padded card, in card px. */
  content: { x: number; y: number; w: number; h: number };
}

const svgBuf = (svg: string) => Buffer.from(svg);

async function buildCard(screenshot: Buffer, viewport: { w: number; h: number }): Promise<CardImage> {
  const meta = await sharp(screenshot).metadata();
  const srcW = meta.width ?? viewport.w;
  const srcH = meta.height ?? viewport.h;
  const scale = srcW / Math.max(1, viewport.w);
  const cropPx = Math.min(srcH - 1, Math.round(CONTROLBAR_CROP_CSS_PX * scale));
  let img = sharp(screenshot).extract({ left: 0, top: 0, width: srcW, height: srcH - cropPx });
  let cw = srcW;
  let ch = srcH - cropPx;
  if (cw > CARD_MAX_W) {
    ch = Math.round(ch * (CARD_MAX_W / cw));
    cw = CARD_MAX_W;
    img = sharp(await img.toBuffer()).resize({ width: cw, height: ch, fit: 'fill' });
  }
  const radius = Math.round(CARD_RADIUS * (cw / 1700));
  const mask = svgBuf(
    `<svg width="${cw}" height="${ch}"><rect x="0" y="0" width="${cw}" height="${ch}" rx="${radius}" fill="#fff"/></svg>`,
  );
  const border = svgBuf(
    `<svg width="${cw}" height="${ch}"><rect x="1" y="1" width="${cw - 2}" height="${ch - 2}" rx="${radius}" fill="none" stroke="${GRAY_150}" stroke-opacity="0.5" stroke-width="2"/></svg>`,
  );
  const rounded = await img
    .composite([
      { input: mask, blend: 'dest-in' },
      { input: border, blend: 'over' },
    ])
    .png()
    .toBuffer();

  const pad = CARD_SHADOW_PAD;
  const w = cw + pad * 2;
  const h = ch + pad * 2;
  const shadow = svgBuf(
    `<svg width="${w}" height="${h}">
      <defs><filter id="b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${Math.round(pad / 3.2)}"/></filter></defs>
      <rect x="${pad}" y="${pad + Math.round(pad / 5)}" width="${cw}" height="${ch}" rx="${radius}" fill="#05060d" fill-opacity="0.55" filter="url(#b)"/>
    </svg>`,
  );
  const png = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: shadow, blend: 'over' },
      { input: rounded, left: pad, top: pad, blend: 'over' },
    ])
    .png()
    .toBuffer();

  return { png, width: w, height: h, content: { x: pad, y: pad, w: cw, h: ch } };
}

function backdropSvg(width: number, height: number): Buffer {
  return svgBuf(
    `<svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="${CODE_BG}"/><stop offset="1" stop-color="${INK}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.12" r="0.9">
          <stop offset="0" stop-color="${INDIGO_400}" stop-opacity="0.28"/>
          <stop offset="0.55" stop-color="${INDIGO_400}" stop-opacity="0.06"/>
          <stop offset="1" stop-color="${INDIGO_400}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g)"/>
      <rect width="${width}" height="${height}" fill="url(#glow)"/>
    </svg>`,
  );
}

function titleCardSvg(width: number, height: number, kicker: string, title: string): Buffer {
  const titleSize = 64;
  const lines = wrapText(title, titleSize, width - 420, 2);
  const kickerSize = 26;
  const kickerText = textPath(kicker, kickerSize);
  const chipPadX = 26;
  const chipW = Math.round(kickerText.width + chipPadX * 2);
  const chipH = 52;
  const blockH = chipH + 44 + lines.length * (titleSize * 1.22);
  const topY = Math.round((height - blockH) / 2);
  const parts: string[] = [];
  parts.push(
    `<g transform="translate(${Math.round((width - chipW) / 2)}, ${topY})">
      <rect width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="${WHITE}" fill-opacity="0.14"/>
      <g transform="translate(${chipPadX}, ${Math.round(chipH / 2 + kickerText.ascent / 2 - 4)})"><path d="${kickerText.d}" fill="${INDIGO_200}"/></g>
    </g>`,
  );
  lines.forEach((line, i) => {
    const p = textPath(line, titleSize);
    const y = topY + chipH + 44 + titleSize + i * titleSize * 1.22;
    parts.push(`<g transform="translate(${Math.round((width - p.width) / 2)}, ${Math.round(y)})"><path d="${p.d}" fill="${WHITE}"/></g>`);
  });
  return svgBuf(
    `<svg width="${width}" height="${height}">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${INDIGO_400}"/><stop offset="1" stop-color="${INDIGO_600}"/>
      </linearGradient></defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <circle cx="${width * 0.85}" cy="${height * 0.18}" r="${height * 0.5}" fill="${WHITE}" fill-opacity="0.05"/>
      <circle cx="${width * 0.1}" cy="${height * 0.92}" r="${height * 0.35}" fill="${INK}" fill-opacity="0.12"/>
      ${parts.join('\n')}
    </svg>`,
  );
}

function captionSvg(stepNumber: number, caption: string): { svg: Buffer; width: number; height: number } {
  const chipText = textPath(`STEP ${stepNumber}`, 22);
  const chipPadX = 18;
  const chipW = Math.round(chipText.width + chipPadX * 2);
  const chipH = 40;
  const textSize = 30;
  const gap = 18;
  const padX = 28;
  const maxText = CAPTION_MAX_W - chipW - gap - padX * 2;
  const line = fitText(caption, textSize, maxText);
  const lineP = textPath(line, textSize);
  const w = Math.round(padX * 2 + chipW + gap + lineP.width);
  const h = CAPTION_H;
  const svg = svgBuf(
    `<svg width="${w}" height="${h}">
      <rect x="0" y="0" width="${w}" height="${h}" rx="24" fill="${WHITE}" fill-opacity="0.97"/>
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="23.5" fill="none" stroke="${GRAY_150}" stroke-width="1"/>
      <g transform="translate(${padX}, ${Math.round((h - chipH) / 2)})">
        <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INDIGO_400}"/><stop offset="1" stop-color="${INDIGO_600}"/></linearGradient></defs>
        <rect width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="url(#c)"/>
        <g transform="translate(${chipPadX}, ${Math.round(chipH / 2 + chipText.ascent / 2 - 3)})"><path d="${chipText.d}" fill="${WHITE}"/></g>
      </g>
      <g transform="translate(${padX + chipW + gap}, ${Math.round(h / 2 + lineP.ascent / 2 - 3)})"><path d="${lineP.d}" fill="${INK}"/></g>
    </svg>`,
  );
  return { svg, width: w, height: h };
}

function cursorSvg(): Buffer {
  // A classic pointer, white-outlined so it reads on any UI.
  const s = CURSOR_SIZE;
  return svgBuf(
    `<svg width="${s}" height="${Math.round(s * 1.15)}" viewBox="0 0 24 27">
      <path d="M4 1 L4 20.5 L9 16.5 L12 24 L15.5 22.5 L12.6 15.4 L19 15 Z" fill="${INK}" stroke="${WHITE}" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`,
  );
}

async function rasterize(svg: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Multiply an RGBA raw buffer's alpha by `a` (0..1), in place. */
function scaleAlpha(img: RawImage, a: number): Buffer {
  const out = Buffer.from(img.data);
  for (let i = 3; i < out.length; i += 4) out[i] = (out[i]! * a) | 0;
  return out;
}

/** Blend `top` over `base` (both full-canvas raw RGBA) with opacity p, writing into base. */
function blendFrames(base: Buffer, top: Buffer, p: number): void {
  const q = 1 - p;
  for (let i = 0; i < base.length; i++) base[i] = (base[i]! * q + top[i]! * p) | 0;
}

/**
 * Queue a raw RGBA overlay at (left, top), cropped to the canvas — sharp refuses any
 * composite that overhangs the frame, and overlays near edges (ripples, highlights,
 * the zoomed card itself) routinely do.
 */
function placeRaw(
  composites: OverlayOptions[],
  img: RawImage,
  left: number,
  top: number,
  canvasW: number,
  canvasH: number,
): void {
  left = Math.round(left);
  top = Math.round(top);
  const x0 = Math.max(0, -left);
  const y0 = Math.max(0, -top);
  const x1 = Math.min(img.width, canvasW - left);
  const y1 = Math.min(img.height, canvasH - top);
  if (x1 <= x0 || y1 <= y0) return;
  if (x0 === 0 && y0 === 0 && x1 === img.width && y1 === img.height) {
    composites.push({ input: img.data, raw: { width: img.width, height: img.height, channels: 4 }, left, top });
    return;
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    img.data.copy(out, row * w * 4, ((y0 + row) * img.width + x0) * 4, ((y0 + row) * img.width + x1) * 4);
  }
  composites.push({ input: out, raw: { width: w, height: h, channels: 4 }, left: left + x0, top: top + y0 });
}

interface DecodedCard {
  raw: RawImage;
  content: { x: number; y: number; w: number; h: number };
}

export async function renderVideo(input: RenderVideoInput): Promise<{ mp4: Buffer; durationMs: number }> {
  if (!ffmpegPath) throw new Error('video-render: ffmpeg-static provided no binary for this platform');
  const { plan } = input;
  const W = plan.width;
  const H = plan.height;

  // --- Pre-rendered static assets -------------------------------------------------
  const backdrop = await rasterize(backdropSvg(W, H));
  const cursor = await rasterize(cursorSvg());
  const cards = new Map<number, { action: CardImage; post: CardImage | null }>();
  for (const seg of plan.segments) {
    if (seg.kind !== 'step') continue;
    const frames = input.steps[seg.index];
    if (!frames) throw new Error(`video-render: no frames for step ${seg.index}`);
    cards.set(seg.index, {
      action: await buildCard(frames.action, frames.viewport),
      post: frames.post ? await buildCard(frames.post, frames.viewport) : null,
    });
  }
  const captions = new Map<number, { raw: RawImage }>();
  for (const seg of plan.segments) {
    if (seg.kind !== 'step') continue;
    captions.set(seg.index, { raw: await rasterize(captionSvg(seg.index + 1, seg.caption).svg) });
  }
  const introCard = await rasterize(titleCardSvg(W, H, 'PRODUCT DEMO', (plan.segments[0] as { text: string }).text));
  const outroCard = await rasterize(
    titleCardSvg(W, H, 'THAT’S THE FLOW', (plan.segments[plan.segments.length - 1] as { text: string }).text),
  );

  // --- Per-segment decoded card cache ---------------------------------------------
  let decodedFor = -1;
  let decoded: { action: DecodedCard; post: DecodedCard | null } | null = null;
  const decodeCards = async (index: number) => {
    if (decodedFor === index && decoded) return decoded;
    const c = cards.get(index);
    if (!c) throw new Error(`video-render: no card for step ${index}`);
    const dec = async (card: CardImage): Promise<DecodedCard> => {
      const { data, info } = await sharp(card.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { raw: { data, width: info.width, height: info.height }, content: card.content };
    };
    decoded = { action: await dec(c.action), post: c.post ? await dec(c.post) : null };
    decodedFor = index;
    return decoded;
  };

  // Stage geometry: where the card sits at zoom 1.
  const stage = { x: STAGE_MARGIN_X, y: STAGE_MARGIN_TOP, w: W - STAGE_MARGIN_X * 2, h: H - STAGE_MARGIN_TOP - CAPTION_CLEARANCE };
  const anchor = { x: W / 2, y: stage.y + stage.h / 2 };

  const renderCardLayer = async (card: DecodedCard, cam: { cx: number; cy: number; zoom: number }) => {
    const { content } = card;
    const aspect = content.w / content.h;
    let dispW0 = stage.w;
    let dispH0 = dispW0 / aspect;
    if (dispH0 > stage.h) {
      dispH0 = stage.h;
      dispW0 = dispH0 * aspect;
    }
    const dispW = dispW0 * cam.zoom;
    const dispH = dispH0 * cam.zoom;
    const s = dispW / content.w; // canvas px per card px
    const contentLeft = anchor.x - cam.cx * dispW;
    const contentTop = anchor.y - cam.cy * dispH;
    const baseLeft = contentLeft - content.x * s;
    const baseTop = contentTop - content.y * s;
    const baseW = card.raw.width * s;
    const baseH = card.raw.height * s;

    // Visible sub-rect of the card on canvas.
    const visLeft = Math.max(0, baseLeft);
    const visTop = Math.max(0, baseTop);
    const visRight = Math.min(W, baseLeft + baseW);
    const visBottom = Math.min(H, baseTop + baseH);
    if (visRight <= visLeft || visBottom <= visTop) return null;

    const srcLeft = Math.max(0, Math.floor((visLeft - baseLeft) / s));
    const srcTop = Math.max(0, Math.floor((visTop - baseTop) / s));
    const srcW = Math.min(card.raw.width - srcLeft, Math.ceil((visRight - visLeft) / s));
    const srcH = Math.min(card.raw.height - srcTop, Math.ceil((visBottom - visTop) / s));
    if (srcW <= 0 || srcH <= 0) return null;
    const outW = Math.max(1, Math.round(srcW * s));
    const outH = Math.max(1, Math.round(srcH * s));

    const piece = await sharp(card.raw.data, { raw: { width: card.raw.width, height: card.raw.height, channels: 4 } })
      .extract({ left: srcLeft, top: srcTop, width: srcW, height: srcH })
      .resize({ width: outW, height: outH, fit: 'fill', kernel: 'cubic' })
      .raw()
      .toBuffer();

    return {
      input: piece,
      rawInfo: { width: outW, height: outH },
      left: Math.round(visLeft),
      top: Math.round(visTop),
      toCanvas: (nx: number, ny: number) => ({ x: contentLeft + nx * dispW, y: contentTop + ny * dispH }),
      scale: { w: dispW, h: dispH },
    };
  };

  const renderStepFrame = async (seg: StepSegment, tLocal: number, whichPost: boolean): Promise<Buffer> => {
    const cardsForStep = await decodeCards(seg.index);
    const card = whichPost && cardsForStep.post ? cardsForStep.post : cardsForStep.action;
    const cam = sampleCamera(seg.camera, tLocal);
    const layer = await renderCardLayer(card, cam);

    const composites: OverlayOptions[] = [];
    if (layer) {
      placeRaw(
        composites,
        { data: layer.input, width: layer.rawInfo.width, height: layer.rawInfo.height },
        layer.left,
        layer.top,
        W,
        H,
      );
    }

    if (layer && seg.highlight && seg.clickMs !== null) {
      const fadeInStart = seg.clickMs - HIGHLIGHT_FADE_IN_MS;
      const fadeOutStart = Math.min((seg.postCutMs ?? seg.clickMs + 900) + 500, seg.durationMs - 600);
      let alpha = 0;
      if (tLocal >= fadeInStart) {
        alpha = Math.min(1, (tLocal - fadeInStart) / HIGHLIGHT_FADE_IN_MS);
        if (tLocal > fadeOutStart) alpha *= Math.max(0, 1 - (tLocal - fadeOutStart) / HIGHLIGHT_FADE_OUT_MS);
      }
      if (alpha > 0.02) {
        const tl = layer.toCanvas(seg.highlight.x, seg.highlight.y);
        const w = Math.max(8, seg.highlight.w * layer.scale.w);
        const h = Math.max(8, seg.highlight.h * layer.scale.h);
        const padR = 7;
        const ring = await rasterize(
          svgBuf(
            `<svg width="${Math.ceil(w + padR * 2 + 8)}" height="${Math.ceil(h + padR * 2 + 8)}">
              <rect x="4" y="4" width="${w + padR * 2}" height="${h + padR * 2}" rx="10" fill="none" stroke="${WHITE}" stroke-opacity="${0.85 * alpha}" stroke-width="5"/>
              <rect x="4" y="4" width="${w + padR * 2}" height="${h + padR * 2}" rx="10" fill="none" stroke="${INDIGO_400}" stroke-opacity="${alpha}" stroke-width="3"/>
            </svg>`,
          ),
        );
        placeRaw(composites, ring, tl.x - padR - 4, tl.y - padR - 4, W, H);
      }
    }

    if (layer && seg.cursor) {
      const pos = sampleCursor(seg.cursor, tLocal);
      const pt = layer.toCanvas(pos.x, pos.y);
      if (seg.clickMs !== null && tLocal >= seg.clickMs && tLocal <= seg.clickMs + RIPPLE_MS) {
        const p = (tLocal - seg.clickMs) / RIPPLE_MS;
        const r = 8 + p * 38;
        const ripple = await rasterize(
          svgBuf(
            `<svg width="120" height="120">
              <circle cx="60" cy="60" r="${r}" fill="none" stroke="${INDIGO_400}" stroke-opacity="${0.9 * (1 - p)}" stroke-width="4"/>
              <circle cx="60" cy="60" r="${Math.max(2, r - 14)}" fill="${INDIGO_400}" fill-opacity="${0.25 * (1 - p)}"/>
            </svg>`,
          ),
        );
        placeRaw(composites, ripple, pt.x - 60, pt.y - 60, W, H);
      }
      placeRaw(composites, cursor, pt.x - 4, pt.y - 2, W, H);
    }

    const caption = captions.get(seg.index);
    if (caption) {
      const alpha = Math.min(1, tLocal / CAPTION_FADE_MS);
      const capImg = alpha >= 1 ? caption.raw : { ...caption.raw, data: scaleAlpha(caption.raw, alpha) };
      placeRaw(
        composites,
        capImg,
        (W - caption.raw.width) / 2,
        H - CAPTION_CLEARANCE + (CAPTION_CLEARANCE - CAPTION_H) / 2 - 10,
        W,
        H,
      );
    }

    return sharp(backdrop.data, { raw: { width: W, height: H, channels: 4 } })
      .composite(composites)
      .raw()
      .toBuffer();
  };

  const renderSegmentFrame = async (seg: VideoSegment, tLocal: number): Promise<Buffer> => {
    if (seg.kind !== 'step') return Buffer.from(seg.kind === 'intro' ? introCard.data : outroCard.data);
    const t = Math.min(tLocal, seg.durationMs);
    if (seg.postCutMs !== null && t >= seg.postCutMs) {
      const p = Math.min(1, (t - seg.postCutMs) / POST_FADE_MS);
      if (p >= 1) return renderStepFrame(seg, t, true);
      const a = await renderStepFrame(seg, t, false);
      const b = await renderStepFrame(seg, t, true);
      blendFrames(a, b, p);
      return a;
    }
    return renderStepFrame(seg, t, false);
  };

  // --- Encode ----------------------------------------------------------------------
  const tmp = await mkdtemp(join(tmpdir(), 'fb-video-'));
  try {
    const audioPath = join(tmp, 'voiceover.wav');
    const outPath = join(tmp, 'demo.mp4');
    await writeFile(audioPath, input.audio);

    const proc = spawn(ffmpegPath, [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${W}x${H}`,
      '-r', String(plan.fps),
      '-i', 'pipe:0',
      '-i', audioPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outPath,
    ]);
    const stderr: Buffer[] = [];
    proc.stderr.on('data', (d: Buffer) => {
      stderr.push(d);
      if (stderr.length > 200) stderr.shift();
    });
    const done = new Promise<void>((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`video-render: ffmpeg exited ${code}: ${Buffer.concat(stderr).toString().slice(-2000)}`));
      });
    });

    const totalFrames = Math.ceil((plan.totalMs / 1000) * plan.fps);
    const frameMs = 1000 / plan.fps;
    let segIdx = 0;
    let prevSegmentLastFrame: Buffer | null = null;
    let stdinOpen = true;
    proc.stdin.on('error', () => {
      stdinOpen = false; // ffmpeg died; the close handler reports why.
    });

    for (let f = 0; f < totalFrames; f++) {
      if (!stdinOpen) break;
      const t = f * frameMs;
      while (segIdx < plan.segments.length - 1) {
        const cur = plan.segments[segIdx]!;
        if (t < cur.startMs + cur.durationMs) break;
        // Freeze the outgoing segment's final frame for the crossfade into the next.
        prevSegmentLastFrame = await renderSegmentFrame(cur, cur.durationMs);
        segIdx++;
      }
      const seg = plan.segments[segIdx]!;
      const tLocal = t - seg.startMs;
      let frame = await renderSegmentFrame(seg, tLocal);
      if (segIdx > 0 && prevSegmentLastFrame && tLocal < plan.transitionMs) {
        const p = tLocal / plan.transitionMs;
        const base = Buffer.from(prevSegmentLastFrame);
        blendFrames(base, frame, p);
        frame = base;
      }
      if (!proc.stdin.write(frame)) await once(proc.stdin, 'drain');
      if (input.onProgress && f % 60 === 0) input.onProgress(f, totalFrames);
    }
    proc.stdin.end();
    await done;
    input.onProgress?.(totalFrames, totalFrames);

    const mp4 = await readFile(outPath);
    return { mp4, durationMs: plan.totalMs };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
