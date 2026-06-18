import type { Article, CapturedEvent, SessionManifest } from '../types.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build static render.html. Screenshots referenced relative to runs/<id>/ via bundle/. */
export function renderHtml(manifest: SessionManifest, articles: Article[]): string {
  const shotByEvent = new Map<string, string>();
  for (const ev of manifest.events) {
    if (ev.screenshot?.file) shotByEvent.set(ev.id, `bundle/${ev.screenshot.file}`);
  }

  const articlesHtml = articles
    .map((a) => {
      const meta = [
        a.intent ? `<p class="intent">${esc(a.intent)}</p>` : '',
        a.preconditions?.length
          ? `<p class="pre"><strong>Preconditions:</strong> ${a.preconditions.map(esc).join('; ')}</p>`
          : '',
        a.tags?.length ? `<p class="tags">${a.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : '',
      ].join('');

      const steps = a.steps
        .map((s, i) => {
          const img = s.screenshotRef && shotByEvent.get(s.screenshotRef);
          return `
          <li class="step${s.uncertain ? ' uncertain' : ''}">
            <div class="step-body">
              <p class="instruction">${esc(s.instruction)}${s.uncertain ? ' <span class="badge">uncertain</span>' : ''}</p>
              ${s.rationale ? `<p class="rationale">${esc(s.rationale)}</p>` : ''}
              ${s.expectedOutcome ? `<p class="outcome">→ ${esc(s.expectedOutcome)}</p>` : ''}
              ${s.selector ? `<p class="selector"><code>${esc(s.selector)}</code></p>` : ''}
            </div>
            ${img ? `<a class="shot" href="${esc(img)}" target="_blank"><img loading="lazy" src="${esc(img)}" alt="step ${i + 1}"></a>` : ''}
          </li>`;
        })
        .join('');

      return `<article>
        <h2>${esc(a.title)}</h2>
        ${meta}
        <ol class="steps">${steps}</ol>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sync spike — KB output (${esc(manifest.id)})</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.55 -apple-system, system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; }
  header { border-bottom: 1px solid #8884; padding-bottom: 12px; margin-bottom: 24px; }
  header .sub { color: #888; font-size: 13px; }
  article { border: 1px solid #8883; border-radius: 12px; padding: 20px 24px; margin: 0 0 28px; }
  h2 { margin: 0 0 8px; }
  .intent { color: #666; margin: 0 0 8px; }
  .pre { font-size: 14px; color: #777; }
  .tags span { display: inline-block; background: #8882; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin-right: 6px; }
  ol.steps { list-style: none; counter-reset: step; padding: 0; margin: 12px 0 0; }
  li.step { counter-increment: step; display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; padding: 14px 0; border-top: 1px solid #8882; }
  li.step::before { content: counter(step); position: absolute; }
  .step-body { position: relative; padding-left: 28px; }
  .step-body::before { content: counter(step); position: absolute; left: 0; top: 0; width: 20px; height: 20px; background: #4a7; color: #fff; border-radius: 50%; font-size: 12px; text-align: center; line-height: 20px; }
  .instruction { font-weight: 600; margin: 0 0 4px; }
  .rationale { color: #777; margin: 0 0 4px; font-size: 14px; }
  .outcome { color: #4a7; margin: 0 0 4px; font-size: 14px; }
  .selector code { font-size: 11px; color: #999; word-break: break-all; }
  .shot img { width: 100%; border: 1px solid #8883; border-radius: 8px; }
  li.uncertain { background: #fc02; }
  .badge { background: #f80; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 4px; vertical-align: middle; }
  @media (max-width: 700px) { li.step { grid-template-columns: 1fr; } .shot { max-width: 360px; } }
</style>
</head>
<body>
  <header>
    <h1>KB output — spike</h1>
    <p class="sub">Session <code>${esc(manifest.id)}</code> · ${esc(manifest.app?.baseUrl)} · ${articles.length} article(s) · ${manifest.events.length} events</p>
  </header>
  ${articlesHtml || '<p>No articles generated.</p>'}
</body>
</html>`;
}
