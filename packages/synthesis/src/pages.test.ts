import { describe, expect, it } from 'vitest';

import { matchPageIdentities, validateExtractedPages } from './pages';
import { formatItems, shapeAnswer } from './engine';
import { shortlistItems, type RetrievableKBItem } from './retrieval';
import type { CopilotKBItem } from './copilot';

// ── validateExtractedPages — the quote anchor is the trust line ─────────────────────────────────

const TRANSCRIPT =
  'So Chatful AI is a SaaS product that lets any SaaS company build their own custom AI chatbot. ' +
  'The starter plan is absolutely free where you can create one chatbot.';

describe('validateExtractedPages', () => {
  it('keeps a page whose quotes appear verbatim in the transcript', () => {
    const out = validateExtractedPages(
      {
        pages: [
          {
            type: 'concept',
            title: 'Plans',
            content: 'The starter plan is free.',
            quotes: ['The starter plan is absolutely free'],
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.quotes).toHaveLength(1);
  });

  it('anchors through whitespace, case and curly-quote differences — but not paraphrase', () => {
    const anchored = validateExtractedPages(
      {
        pages: [
          {
            type: 'concept',
            title: 'What it is',
            content: 'A chatbot builder.',
            quotes: ['chatful ai is a  SaaS product'],
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(anchored).toHaveLength(1);

    const paraphrased = validateExtractedPages(
      {
        pages: [
          {
            type: 'concept',
            title: 'What it is',
            content: 'A chatbot builder.',
            quotes: ['Chatful AI is a software platform'], // not what was said
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(paraphrased).toHaveLength(0); // unanchored = dropped, however plausible
  });

  it('drops a page whose every quote fails, keeps only surviving quotes on one that passes', () => {
    const out = validateExtractedPages(
      {
        pages: [
          {
            type: 'overview',
            title: 'Chatful AI',
            content: 'What the product is.',
            quotes: ['build their own custom AI chatbot', 'entirely invented sentence'],
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.quotes).toEqual(['build their own custom AI chatbot']);
  });

  it('enforces one overview, dedupes titles, and tolerates garbage shapes', () => {
    const out = validateExtractedPages(
      {
        pages: [
          { type: 'overview', title: 'A', content: 'x', quotes: ['custom AI chatbot'] },
          { type: 'overview', title: 'B', content: 'y', quotes: ['custom AI chatbot'] },
          { type: 'concept', title: 'a', content: 'z', quotes: ['custom AI chatbot'] }, // dup title (case)
          null,
          { type: 'nonsense', title: 'C', content: 'w', quotes: ['custom AI chatbot'] },
        ],
      },
      TRANSCRIPT,
    );
    expect(out.map((p) => p.title)).toEqual(['A']);
  });

  it('accepts area pages, and anchors related titles against the real workflow list', () => {
    const out = validateExtractedPages(
      {
        pages: [
          {
            type: 'area',
            title: 'Analytics',
            content: 'Shows chatbot usage.',
            quotes: ['custom AI chatbot'],
            related: ['create a chatbot project', 'Invented Workflow', 'Test the chatbot'],
          },
        ],
      },
      TRANSCRIPT,
      ['Create a chatbot project', 'Test the chatbot'],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('area');
    // Known titles survive in CANONICAL spelling; the invented one is dropped — the quote rule,
    // applied to links.
    expect(out[0]!.related).toEqual(['Create a chatbot project', 'Test the chatbot']);
  });
});

// ── matchPageIdentities — one-vector greedy identity ────────────────────────────────────────────

describe('matchPageIdentities', () => {
  it('matches above the threshold, one-to-one, and leaves the rest unmatched', () => {
    const a = [1, 0, 0];
    const nearA = [0.95, 0.05, 0];
    const b = [0, 1, 0];
    const m = matchPageIdentities(
      [
        { key: 'in-a', vector: nearA },
        { key: 'in-b', vector: b },
        { key: 'in-new', vector: [0, 0, 1] },
      ],
      [
        { key: 'ex-a', vector: a },
        { key: 'ex-b', vector: b },
      ],
    );
    expect(m.get('in-a')).toBe('ex-a');
    expect(m.get('in-b')).toBe('ex-b');
    expect(m.has('in-new')).toBe(false); // genuinely new — born unapproved
  });
});

// ── the PRODUCT BACKGROUND layer in the shared renderer + citations ─────────────────────────────

const step = (id: string, extra?: Partial<CopilotKBItem>): CopilotKBItem => ({
  id,
  workflowId: 'wf1',
  sourceId: 'src1',
  segmentIndex: 0,
  segmentTitle: 'Create an account',
  text: `Step ${id}`,
  ...extra,
});
const topic = (id: string, title: string, text: string): CopilotKBItem => ({
  id,
  workflowId: '',
  kind: 'topic',
  sourceId: '',
  segmentIndex: null,
  segmentTitle: title,
  text,
});

describe('formatItems with product pages', () => {
  it('is byte-identical to the step-only rendering when no page is present', () => {
    const items = [step('s1'), step('s2')];
    expect(formatItems(items)).not.toContain('PRODUCT BACKGROUND');
  });

  it('renders pages as a PRODUCT BACKGROUND section after the workflow groups', () => {
    const out = formatItems([step('s1'), topic('p1', 'Plans & pricing', 'Starter is free.')]);
    const bgAt = out.indexOf('PRODUCT BACKGROUND');
    expect(bgAt).toBeGreaterThan(out.indexOf('id=s1'));
    expect(out).toContain('[about: Plans & pricing]: Starter is free.');
  });

  it('renders a background-only shortlist without a phantom workflow group', () => {
    const out = formatItems([topic('p1', 'Overview', 'What the product is.')]);
    expect(out.startsWith('PRODUCT BACKGROUND')).toBe(true);
    expect(out).not.toContain('key=');
  });

  it('surfaces a page’s related workflows with their get_workflow keys', () => {
    const page: CopilotKBItem = {
      ...topic('p1', 'Chatbot project', 'A project is the entry point.'),
      related: [{ title: 'Create a chatbot project', key: 'src1:1' }],
    };
    const out = formatItems([page]);
    expect(out).toContain('related workflows: "Create a chatbot project" (key=src1:1)');
  });
});

describe('shapeAnswer with product pages', () => {
  it('lets pages ground the answer but keeps them out of the citations array', () => {
    const items = [step('s1'), topic('p1', 'Plans', 'Starter is free.')];
    const res = shapeAnswer({
      content: JSON.stringify({ covered: true, answer: 'ok', citedItemIds: ['p1', 's1'] }),
      items,
      declineReason: 'no',
    });
    if (!res.covered) throw new Error('expected covered');
    expect(res.citations.map((c) => c.itemId)).toEqual(['s1']); // the page informed, the workflow cites
  });
});

// ── pages compete in the keyword shortlist like any other item ──────────────────────────────────

describe('shortlistItems with the page corpus', () => {
  it('ranks a page above unrelated steps when the question matches its text', () => {
    const pool: RetrievableKBItem[] = [
      { id: 's1', workflowId: 'wf1', sourceId: 'src1', segmentIndex: 0, segmentTitle: 'Login', text: 'Click the login button', data: {} },
      { id: 'p1', workflowId: '', kind: 'topic', sourceId: '', segmentIndex: null, segmentTitle: 'Plans & pricing', text: 'The professional plan costs $49 per month and allows three chatbots', data: {} },
    ];
    const out = shortlistItems(pool, 'how much does the professional plan cost?', { limit: 2 });
    expect(out[0]!.id).toBe('p1');
    expect(out[0]!.kind).toBe('topic');
  });
});
