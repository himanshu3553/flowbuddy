/** Reads a bundle artifact by its relative path (e.g. "shots/<id>.png", "audio.webm").
 *  Returns null if missing. The caller decides where artifacts live (R2/MinIO/disk). */
export type ArtifactReader = (relPath: string) => Promise<Buffer | null>;
