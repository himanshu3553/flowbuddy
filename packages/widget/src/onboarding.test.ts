import { describe, expect, it } from 'vitest';
import { pickOnboarding, type OnboardingWorkflowWire } from './onboarding.js';

const invite: OnboardingWorkflowWire = { key: 's1:0', title: 'Invite a teammate', route: '/team/invite' };
const settings: OnboardingWorkflowWire = { key: 's1:1', title: 'Set up billing', route: '/settings' };
const teamHub: OnboardingWorkflowWire = { key: 's2:0', title: 'Tour the team page', route: '/team' };

describe('pickOnboarding — which flagged workflow auto-starts on this page', () => {
  it('fires the workflow whose first route matches the page, and only that one', () => {
    expect(pickOnboarding([invite, settings], '/team/invite', {}, 1)).toBe(invite);
    expect(pickOnboarding([invite, settings], '/settings', {}, 1)).toBe(settings);
    expect(pickOnboarding([invite, settings], '/reports', {}, 1)).toBeNull();
  });

  it('matches as a PATTERN — a record id in the page never blocks the match', () => {
    const edit: OnboardingWorkflowWire = { key: 's3:0', title: 'Edit a project', route: '/projects/:id/edit' };
    expect(pickOnboarding([edit], '/projects/6a6a49ca-1b2c-4d5e-8f90-123456789abc/edit', {}, 1)).toBe(edit);
  });

  it('prefers the exact page over an ancestor, and a tie keeps list order (flagged first)', () => {
    // /team/invite is an exact match for `invite` and only a prefix match for `teamHub`.
    expect(pickOnboarding([teamHub, invite], '/team/invite', {}, 1)).toBe(invite);
    // Two workflows that begin on the same page: the one the founder flagged first wins.
    const twin: OnboardingWorkflowWire = { key: 's4:0', title: 'Also on invite', route: '/team/invite' };
    expect(pickOnboarding([twin, invite], '/team/invite', {}, 1)).toBe(twin);
    expect(pickOnboarding([invite, twin], '/team/invite', {}, 1)).toBe(invite);
  });

  it('spends the founder budget: shows at or over maxShows stop it, a bigger budget lets it back', () => {
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 1 } }, 1)).toBeNull();
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 1 } }, 3)).toBe(invite);
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 3 } }, 3)).toBeNull();
  });

  it('never returns for a completed or dismissed workflow, whatever the budget', () => {
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 0, done: true } }, 10)).toBeNull();
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 0, dismissed: true } }, 10)).toBeNull();
  });

  it('a spent workflow yields the page to the next eligible one', () => {
    const twin: OnboardingWorkflowWire = { key: 's4:0', title: 'Also on invite', route: '/team/invite' };
    expect(pickOnboarding([invite, twin], '/team/invite', { 's1:0': { shows: 1 } }, 1)).toBe(twin);
  });

  it('treats a nonsense budget as 1 and skips entries with no key or route', () => {
    expect(pickOnboarding([invite], '/team/invite', { 's1:0': { shows: 1 } }, Number.NaN)).toBeNull();
    expect(pickOnboarding([invite], '/team/invite', {}, 0)).toBe(invite);
    expect(pickOnboarding([{ key: '', title: 'x', route: '/team/invite' }], '/team/invite', {}, 1)).toBeNull();
    expect(pickOnboarding([{ key: 's9:0', title: 'x', route: '' }], '/team/invite', {}, 1)).toBeNull();
  });
});
