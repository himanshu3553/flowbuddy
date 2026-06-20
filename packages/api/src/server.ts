import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sync/db';
import { sessionManifestSchema } from '@sync/shared';
import { config } from './config';
import { authWorkspace } from './auth';
import { ensureBucket, putObject, sessionKey } from './storage';
import { synthesisQueue } from './queue';

const app = Fastify({ logger: true });

// CORS so the extension (chrome-extension://...) can upload.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

await app.register(multipart, {
  limits: { fileSize: 300 * 1024 * 1024, files: 10000, fieldSize: 100 * 1024 * 1024 },
});

app.get('/healthz', async () => ({ ok: true }));

/**
 * Token-authenticated bundle upload.
 * Files ride their relative path on the multipart field NAME (multipart strips
 * directories from filenames); we stream each to object storage, validate the
 * manifest, persist a RecSession, and enqueue synthesis.
 */
app.post('/v1/sessions', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const sessionId = randomUUID();
  let manifestRaw: unknown = null;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const rel = part.fieldname || part.filename || `file-${randomUUID()}`;
      const buf = await part.toBuffer();
      await putObject(sessionKey(ws.workspaceId, sessionId, rel), buf, part.mimetype);
    } else if (part.fieldname === 'manifest') {
      try {
        manifestRaw = JSON.parse(String(part.value));
      } catch {
        manifestRaw = null;
      }
    }
  }

  const parsed = sessionManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid manifest', issues: parsed.error.issues.slice(0, 5) });
  }
  const m = parsed.data;

  await prisma.knowledgeSource.create({
    data: {
      id: sessionId,
      workspaceId: ws.workspaceId,
      createdById: ws.ownerId,
      status: 'uploaded',
      appBaseUrl: m.app.baseUrl,
      manifest: m as object,
    },
  });

  await synthesisQueue.add('synthesize', { sessionId, workspaceId: ws.workspaceId });

  return { sessionId, status: 'uploaded' };
});

app.get('/v1/sessions/:id', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });
  const { id } = req.params as { id: string };
  const s = await prisma.knowledgeSource.findFirst({ where: { id, workspaceId: ws.workspaceId } });
  if (!s) return reply.code(404).send({ error: 'not found' });
  return { id: s.id, status: s.status, error: s.error };
});

await ensureBucket();

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => app.log.info(`Sync api on http://localhost:${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
