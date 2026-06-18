import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .env lives at spike/.env (two levels up from backend/src), regardless of cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Don't crash at import time — the server should still boot so you can see
    // status pages. Pipeline stages throw a clear error when the key is missing.
    return '';
  }
  return v;
}

export const config = {
  openaiApiKey: required('OPENAI_API_KEY'),
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-1',
  synthModel: process.env.SYNTH_MODEL || 'gpt-4o',
  port: Number(process.env.PORT || 8787),
};

export function assertOpenAIKey(): void {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Copy spike/.env.example to spike/.env and add your key.',
    );
  }
}
