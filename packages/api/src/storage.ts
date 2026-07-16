import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Transform, type Readable } from 'node:stream';
import type { ArtifactReader } from '@flowbuddy/synthesis';
import { createLogger } from '@flowbuddy/logger';
import { config } from './config';

const log = createLogger('storage');

// S3-compatible client — points at local MinIO in dev, Cloudflare R2 in prod.
export const s3 = new S3Client({
  endpoint: config.r2.endpoint,
  region: config.r2.region,
  credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  forcePathStyle: true, // required for MinIO; harmless for R2
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.r2.bucket }));
    log.debug({ bucket: config.r2.bucket }, 'object-storage bucket present');
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.r2.bucket }));
    log.info({ bucket: config.r2.bucket }, 'created object-storage bucket');
  }
}

/** Object key layout: workspaces/<wsId>/sessions/<sessionId>/<relative-path> */
export function sessionKey(workspaceId: string, sessionId: string, rel: string): string {
  const safeRel = rel.replace(/\\/g, '/').replace(/\.\.(\/|$)/g, '');
  return `workspaces/${workspaceId}/sessions/${sessionId}/${safeRel}`;
}

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * Stream a multipart file part straight to object storage WITHOUT materializing it in RAM
 * (ingestion runs on a 512 MB instance next to the public copilot). Returns the byte count so the
 * caller can enforce a total-bundle cap. `Upload` handles multipart chunking for unknown lengths.
 */
export async function putObjectStream(key: string, body: Readable, contentType?: string): Promise<number> {
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  const upload = new Upload({
    client: s3,
    params: { Bucket: config.r2.bucket, Key: key, Body: body.pipe(counter), ContentType: contentType },
  });
  await upload.done();
  return bytes;
}

/** Delete every stored object under one session's prefix — used to clean up a rejected/failed
 *  upload so nothing is orphaned in R2. Mirrors web/lib/storage.ts `deleteSessionPrefix`. */
export async function deleteSessionPrefix(workspaceId: string, sessionId: string): Promise<void> {
  const prefix = `workspaces/${workspaceId}/sessions/${sessionId}/`;
  let token: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: config.r2.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: config.r2.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

/** An `ArtifactReader` bound to one session — reads bundle files (screenshots, audio) from
 *  object storage by their relative path. Used by the synthesis worker; returns null if missing. */
export function sessionArtifactReader(workspaceId: string, sessionId: string): ArtifactReader {
  return async (relPath: string): Promise<Buffer | null> => {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: config.r2.bucket, Key: sessionKey(workspaceId, sessionId, relPath) }),
      );
      const bytes = await (obj.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  };
}
