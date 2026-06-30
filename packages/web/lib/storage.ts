import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT || 'http://localhost:9000',
  region: process.env.R2_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const bucket = process.env.R2_BUCKET || 'sync-artifacts';

/** Short-lived signed GET URL so the browser can load a private screenshot. */
export function signedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

/** Object key for a session artifact (mirrors the api's `workspaces/<ws>/sessions/<id>/<rel>` layout). */
export function sessionObjectKey(workspaceId: string, sessionId: string, rel: string): string {
  return `workspaces/${workspaceId}/sessions/${sessionId}/${rel}`;
}

/** Delete every stored object for one recording (screenshots, audio, DOM snapshots) under its
 *  session prefix. Called when a recording is deleted so nothing is orphaned in object storage. */
export async function deleteSessionPrefix(workspaceId: string, sessionId: string): Promise<void> {
  const prefix = `workspaces/${workspaceId}/sessions/${sessionId}/`;
  let token: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

/** An `ArtifactReader` (relPath → Buffer) for synthesis to fetch a session's screenshots from
 *  object storage during curated generation (M6.1). Mirrors the worker's getArtifact. */
export function artifactReader(workspaceId: string, sessionId: string) {
  return async (relPath: string): Promise<Buffer | null> => {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: sessionObjectKey(workspaceId, sessionId, relPath) }),
      );
      const bytes = await (obj.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  };
}
