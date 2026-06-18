import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from './config.js';
import { RUNS_ROOT, ensureDir, readStatus, runDir, saveBundleFile, writeJson } from './storage.js';
import { runPipeline } from './pipeline.js';
import type { SessionManifest } from './types.js';

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 });

// Minimal CORS so the extension (chrome-extension://...) can POST here.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') reply.code(204).send();
});

await app.register(multipart, {
  limits: { fileSize: 300 * 1024 * 1024, files: 10000, fieldSize: 100 * 1024 * 1024 },
});

await ensureDir(RUNS_ROOT);
await app.register(fastifyStatic, { root: RUNS_ROOT, prefix: '/runs/', index: ['render.html'] });

app.get('/health', async () => ({ ok: true, model: config.synthModel }));

/**
 * Receive a session bundle (multipart). Files are saved under runs/<id>/bundle/<filename>;
 * the `manifest` field is parsed and written as bundle/session.json. The run id is
 * generated server-side so file ordering in the stream doesn't matter.
 */
app.post('/sessions', async (req, reply) => {
  const id = randomUUID();
  await ensureDir(runDir(id));
  let manifest: SessionManifest | null = null;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      // The relative path (e.g. "shots/<id>.png") is sent as the field NAME,
      // because multipart strips directories from the filename.
      const rel = part.fieldname || part.filename || `file-${randomUUID()}`;
      await saveBundleFile(id, rel, part.file as unknown as Readable);
    } else if (part.fieldname === 'manifest') {
      try {
        manifest = JSON.parse(String(part.value)) as SessionManifest;
      } catch {
        manifest = null;
      }
    }
  }

  if (!manifest) {
    reply.code(400);
    return { error: 'Missing or invalid `manifest` field.' };
  }

  manifest.id = id; // authoritative id
  await writeJson(id, 'bundle/session.json', manifest);

  // Run the pipeline inline; respond when done so the extension can open the result.
  const status = await runPipeline(id);
  return {
    id,
    status: status.stage,
    error: status.error,
    articleCount: status.articleCount,
    renderUrl: status.renderUrl,
  };
});

app.get('/sessions/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const status = await readStatus(id);
  if (!status) {
    reply.code(404);
    return { error: 'unknown session' };
  }
  return status;
});

// Convenience redirect to the rendered KB.
app.get('/sessions/:id/render', async (req, reply) => {
  const { id } = req.params as { id: string };
  reply.redirect(`/runs/${id}/render.html`);
});

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    app.log.info(`Sync spike backend on http://localhost:${config.port}`);
    if (!config.openaiApiKey) {
      app.log.warn('OPENAI_API_KEY not set — uploads will fail at the transcribe stage. Add it to spike/.env');
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
