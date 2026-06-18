// Re-run the pipeline on an already-captured session (no re-recording).
// Usage: npm run reprocess <session-id>
// This is the "iterate synthesis on a stored bundle" path (Risk A).

import { runPipeline } from './pipeline.js';

const id = process.argv[2];
if (!id) {
  console.error('usage: npm run reprocess <session-id>');
  process.exit(1);
}

const status = await runPipeline(id);
console.log(JSON.stringify(status, null, 2));
if (status.renderUrl) console.log('\nOpen the KB:', status.renderUrl);
process.exit(status.stage === 'done' ? 0 : 1);
