import 'dotenv/config';

/** Normalize a URL to bare Origin-header form (scheme://host[:port], no path/trailing slash). */
function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

export const config = {
  port: Number(process.env.PORT || 8787),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // The Studio's origin — exempt from workspace origin allowlists so the in-Studio real-widget
  // tester keeps working after a customer locks the copilot to their own site's origins.
  studioOrigin: toOrigin(process.env.SYNC_STUDIO_URL || 'http://localhost:3000'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-1',
  synthModel: process.env.SYNTH_MODEL || 'gpt-4o',
  // P2-M5 Reason — the diagnostic path's STRONGER (vision-capable) model; falls back to the
  // answer model so a default deploy works untouched.
  reasonModel: process.env.REASON_MODEL || process.env.SYNTH_MODEL || 'gpt-4o',
  // P1-M3 hybrid retrieval — '' lets @sync/synthesis apply its DEFAULT_EMBED_MODEL
  // (text-embedding-3-small); the model must match the vector(1536) column dims.
  embedModel: process.env.EMBED_MODEL || '',
  r2: {
    endpoint: process.env.R2_ENDPOINT || 'http://localhost:9000',
    region: process.env.R2_REGION || 'auto',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'minioadmin',
    bucket: process.env.R2_BUCKET || 'sync-artifacts',
  },
};
