import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import type { ArtifactReader } from '@sync/synthesis';
import { config } from './config';

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
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.r2.bucket }));
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
