import { assertOpenAIKey, config } from './config.js';
import { readJson, writeJson, writeStatus, writeText } from './storage.js';
import { transcribe } from './stages/transcribe.js';
import { alignNarration } from './stages/align.js';
import { segment } from './stages/segment.js';
import { synthesize } from './stages/synthesize.js';
import { renderHtml } from './stages/render.js';
import type { Article, RunStatus, SessionManifest, Transcript } from './types.js';

/**
 * Inline pipeline: transcribe -> align -> segment -> synthesize -> render.
 * Each stage writes its artifact so a bad result can be localized.
 */
export async function runPipeline(id: string): Promise<RunStatus> {
  const status: RunStatus = {
    id,
    stage: 'received',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeStatus(status);

  try {
    assertOpenAIKey();
    const manifest = await readJson<SessionManifest>(id, 'bundle/session.json');

    // 1. transcribe
    status.stage = 'transcribe';
    await writeStatus(status);
    const transcript: Transcript = await transcribe(manifest);
    await writeJson(id, 'transcript.json', transcript);

    // 2. align narration to events
    const narration = alignNarration(manifest.events, transcript);

    // 3. segment
    status.stage = 'segment';
    await writeStatus(status);
    const segmentation = await segment(manifest.events, manifest.markers || [], narration);
    await writeJson(id, 'segments.json', segmentation);

    // 4. synthesize
    status.stage = 'synthesize';
    await writeStatus(status);
    const articles: Article[] = await synthesize(
      id,
      segmentation.segments,
      manifest.events,
      narration,
    );
    await writeJson(id, 'articles.json', articles);

    // 5. render
    status.stage = 'render';
    await writeStatus(status);
    await writeText(id, 'render.html', renderHtml(manifest, articles));

    status.stage = 'done';
    status.articleCount = articles.length;
    status.renderUrl = `http://localhost:${config.port}/runs/${id}/render.html`;
    await writeStatus(status);
    return status;
  } catch (err) {
    status.stage = 'error';
    status.error = err instanceof Error ? err.message : String(err);
    await writeStatus(status);
    return status;
  }
}
