import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';
import type { RunStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// runs/ lives at spike/runs (two levels up from backend/src)
export const RUNS_ROOT = path.resolve(__dirname, '..', '..', 'runs');

export function runDir(id: string): string {
  return path.join(RUNS_ROOT, id);
}
export function bundleDir(id: string): string {
  return path.join(runDir(id), 'bundle');
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Save a readable stream to a path under the run's bundle dir, creating subdirs. */
export async function saveBundleFile(id: string, relPath: string, data: Readable): Promise<void> {
  // relPath is e.g. "audio.webm" | "shots/<id>.png" | "dom/<id>.html"
  const safeRel = relPath.replace(/\\/g, '/').replace(/\.\.(\/|$)/g, '');
  const dest = path.join(bundleDir(id), safeRel);
  await ensureDir(path.dirname(dest));
  await pipeline(data, createWriteStream(dest));
}

export async function writeJson(id: string, name: string, value: unknown): Promise<void> {
  const target = path.join(runDir(id), name);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, JSON.stringify(value, null, 2), 'utf8');
}

export async function readJson<T>(id: string, name: string): Promise<T> {
  const raw = await fs.readFile(path.join(runDir(id), name), 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeText(id: string, name: string, text: string): Promise<void> {
  const target = path.join(runDir(id), name);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, text, 'utf8');
}

export function bundleFilePath(id: string, relPath: string): string {
  return path.join(bundleDir(id), relPath);
}

export async function writeStatus(status: RunStatus): Promise<void> {
  status.updatedAt = new Date().toISOString();
  await writeJson(status.id, 'status.json', status);
}

export async function readStatus(id: string): Promise<RunStatus | null> {
  try {
    return await readJson<RunStatus>(id, 'status.json');
  } catch {
    return null;
  }
}
