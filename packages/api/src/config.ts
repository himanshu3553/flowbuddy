import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8787),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-1',
  synthModel: process.env.SYNTH_MODEL || 'gpt-4o',
  r2: {
    endpoint: process.env.R2_ENDPOINT || 'http://localhost:9000',
    region: process.env.R2_REGION || 'auto',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'minioadmin',
    bucket: process.env.R2_BUCKET || 'sync-artifacts',
  },
};
