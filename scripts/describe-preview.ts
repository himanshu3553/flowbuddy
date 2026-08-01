// Read-only preview: what the description generator would write for every workflow already in the
// KB. Touches nothing — it never writes. Run: pnpm --filter @flowbuddy/api exec tsx ../../scripts/describe-preview.ts
import 'dotenv/config';
import OpenAI from 'openai';
import { prisma } from '@flowbuddy/db';
import { describeWorkflow } from '@flowbuddy/synthesis';

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.SYNTH_MODEL || 'gpt-5.6-sol';

  const only = process.env.ONLY_SOURCE;
  const workflows = await prisma.workflow.findMany({
    where: only ? { sourceId: only } : {},
    select: { id: true, title: true, sourceId: true, segmentIndex: true },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }],
  });

  for (const w of workflows) {
    const [src, items] = await Promise.all([
      prisma.knowledgeSource.findUnique({ where: { id: w.sourceId }, select: { transcript: true } }),
      prisma.knowledgeItem.findMany({ where: { workflowId: w.id }, orderBy: { orderIndex: 'asc' }, select: { data: true } }),
    ]);
    const steps = items.map((i) => {
      const d = (i.data ?? {}) as { instruction?: string; detail?: string; route?: string };
      return { instruction: d.instruction ?? '', detail: d.detail, route: d.route ?? '', narration: null, screenshotFile: null };
    });
    const transcript = ((src?.transcript as { text?: string } | null)?.text) ?? '';
    const desc = await describeWorkflow(openai, model, w.title ?? 'Workflow', steps as never, transcript);
    console.log(`\n━━━━━ ${w.title}  (${steps.length} steps)`);
    console.log(desc ?? '  (none produced)');
    if (process.env.WRITE === '1' && desc) {
      await prisma.workflow.update({ where: { id: w.id }, data: { description: desc } });
      console.log('  ↳ written');
    }
  }
  await prisma.$disconnect();
}

main();
