import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
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
