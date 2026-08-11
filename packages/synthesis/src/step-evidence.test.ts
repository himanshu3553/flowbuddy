import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';
import { attachStepEvidence, extractDisappearedMarkers, extractStepEvidence } from './step-evidence';

/**
 * P3-M2 — the step EVIDENCE layer (execution-contracts.md EC-1/EC-7/EC-8). What is pinned here:
 * the extraction is deterministic and scrubbed (evidence ships to every embed), a timed-out
 * after-state never proves absence, a PII-touched label is dropped rather than shipped, and the
 * build-time attach pass is best-effort — a failed read must never fail a step, let alone a build.
 */

let seq = 0;
function ev(partial: Partial<CapturedEvent> & { type: string }): CapturedEvent {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    t: seq * 1000,
    target: {},
    route: { url: 'https://app.example.com/team', path: '/team', hash: '', title: 'Team' },
    ...partial,
  } as CapturedEvent;
}

const PRE = `<html><body><h1>Team members</h1><button>Invite member</button></body></html>`;
const POST = `<html><body><h1>Team members</h1><div role="status">Invitation sent</div></body></html>`;

describe('extractStepEvidence', () => {
  it('captures appeared AND disappeared phrases from the before/after pair', () => {
    const e = ev({
      type: 'click',
      target: { tag: 'button', accessibleName: 'Invite member' },
      postAction: { settleReason: 'mutation_quiet' },
    });
    const evidence = extractStepEvidence(e, { pre: PRE, post: POST });
    expect(evidence?.appeared).toEqual(['Invitation sent']);
    expect(evidence?.disappeared).toEqual(['Invite member']);
    expect(evidence?.label).toBe('Invite member');
  });

  it('a timed-out settle proves what appeared, never what is absent', () => {
    const e = ev({
      type: 'click',
      target: { tag: 'button', accessibleName: 'Invite member' },
      postAction: { settleReason: 'timeout' },
    });
    const evidence = extractStepEvidence(e, { pre: PRE, post: POST });
    expect(evidence?.appeared).toEqual(['Invitation sent']);
    expect(evidence?.disappeared).toBeUndefined();
  });

  it('drops a label scrubbing had to touch — a PII label would hand back every run', () => {
    const e = ev({
      type: 'click',
      target: { tag: 'button', accessibleName: 'Email user@acme.com' },
    });
    const evidence = extractStepEvidence(e, {});
    expect(evidence).toBeUndefined();
  });

  it('records the landing title only on PATTERN-changing navigations', () => {
    const navigates = ev({
      type: 'click',
      target: { tag: 'a', accessibleName: 'Settings' },
      postAction: {
        route: { url: 'https://app.example.com/settings', path: '/settings', hash: '', title: 'Workspace settings' },
      },
    });
    expect(extractStepEvidence(navigates, {})?.landedTitle).toBe('Workspace settings');

    const sameScreen = ev({
      type: 'click',
      target: { tag: 'a', accessibleName: 'Open project' },
      route: { url: 'https://app.example.com/projects/123', path: '/projects/123', hash: '', title: '' },
      postAction: {
        route: { url: 'https://app.example.com/projects/456', path: '/projects/456', hash: '', title: 'Other project' },
      },
    });
    expect(extractStepEvidence(sameScreen, {})?.landedTitle).toBeUndefined();
  });

  it('a nav event carries no element label', () => {
    const e = ev({ type: 'nav', target: { tag: 'document', accessibleName: 'Team' } });
    expect(extractStepEvidence(e, {})?.label).toBeUndefined();
  });
});

describe('extractDisappearedMarkers', () => {
  it('is the inverse diff, capped tighter than appeared', () => {
    const pre = `<div>One thing</div><div>Two thing</div><div>Three thing</div><div>Four thing</div><div>Stays put</div>`;
    const post = `<div>Stays put</div>`;
    const gone = extractDisappearedMarkers(pre, post);
    expect(gone.length).toBeLessThanOrEqual(3);
    expect(gone).toContain('One thing');
    expect(gone).not.toContain('Stays put');
  });
});

describe('attachStepEvidence (the build-time pass)', () => {
  const events = [
    ev({
      id: 'k1',
      type: 'click',
      target: { tag: 'button', accessibleName: 'Invite member' },
      domSnapshot: { file: 'dom/k1.html' },
      postAction: { domSnapshot: { file: 'dom/k1-post.html' }, settleReason: 'mutation_quiet' },
    }),
    ev({ id: 'k2', type: 'click', target: { tag: 'button', accessibleName: 'Send invite' } }),
  ];
  const files: Record<string, string> = { 'dom/k1.html': PRE, 'dom/k1-post.html': POST };

  it('attaches snapshot-derived evidence where artifacts resolve, label-only evidence elsewhere', async () => {
    const steps = [{ keyEventId: 'k1' }, { keyEventId: 'k2' }, { keyEventId: 'missing' }];
    const out = await attachStepEvidence(steps, events, async (f) =>
      files[f] ? Buffer.from(files[f]!) : null,
    );
    expect(out[0]!.evidence?.appeared).toEqual(['Invitation sent']);
    expect(out[1]!.evidence).toEqual({ label: 'Send invite' }); // no snapshots — label still attaches
    expect(out[2]!.evidence).toBeUndefined(); // unrecovered event — step untouched
  });

  it('a throwing reader costs that step its snapshot evidence, nothing more', async () => {
    const out = await attachStepEvidence([{ keyEventId: 'k1' }], events, async () => {
      throw new Error('storage down');
    });
    expect(out[0]!.evidence).toEqual({ label: 'Invite member' });
  });

  it('an INPUT event with post-action snapshots (v0.9.0 capture) gets fill-step expectations too', async () => {
    const inputEvents = [
      ev({
        id: 'f1',
        type: 'input',
        target: { tag: 'input', accessibleName: 'Email address' },
        domSnapshot: { file: 'dom/f1.html' },
        postAction: { domSnapshot: { file: 'dom/f1-post.html' }, settleReason: 'mutation_quiet' },
      }),
    ];
    const inputFiles: Record<string, string> = {
      'dom/f1.html': `<div><label>Email address</label></div>`,
      'dom/f1-post.html': `<div><label>Email address</label><div class="ok">Looks good</div></div>`,
    };
    const out = await attachStepEvidence([{ keyEventId: 'f1' }], inputEvents, async (f) =>
      inputFiles[f] ? Buffer.from(inputFiles[f]!) : null,
    );
    expect(out[0]!.evidence?.appeared).toEqual(['Looks good']);
    expect(out[0]!.evidence?.label).toBe('Email address');
  });
});
