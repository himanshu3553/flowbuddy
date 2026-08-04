import { describe, expect, it } from 'vitest';
import {
  SCREEN_MATCH_MIN,
  buildFingerprint,
  isIdentifiable,
  normalizeAnchor,
  screenMatchScore,
  titleTokens,
  type LiveScreen,
} from '@flowbuddy/shared/screen-fingerprint';

/**
 * Recognising a screen by what is ON it.
 *
 * WHY THIS FILE EXISTS. The scorer that consumes fingerprints lives in the widget, where there is no
 * test runner — so everything that can be decided without a DOM is decided here instead: what counts
 * as a label, how much of a recorded screen must survive to call it the same screen, and the two
 * failure modes that matter. A fingerprint that identifies too eagerly puts a user in the wrong
 * workflow; one that never identifies anything is merely the old behaviour.
 */

const live = (title: string, anchors: string[]): LiveScreen => ({ title, anchors });

describe('normalizeAnchor', () => {
  it('reduces a label to its comparable form', () => {
    expect(normalizeAnchor('  Send   Invitation ')).toBe('send invitation');
    expect(normalizeAnchor('Team members:')).toBe('team members');
    expect(normalizeAnchor('“Save”')).toBe('save');
  });

  it('rejects what is not a label', () => {
    expect(normalizeAnchor('')).toBe('');
    expect(normalizeAnchor('x')).toBe(''); // too short to mean anything
    expect(normalizeAnchor('42')).toBe(''); // a count badge or a record number
    expect(normalizeAnchor('a'.repeat(60))).toBe(''); // a paragraph, not a label
  });
});

describe('titleTokens', () => {
  it('splits the usual title separators and drops noise', () => {
    expect(titleTokens('Acme Corp — Team settings | MyApp')).toEqual([
      'acme',
      'corp',
      'team',
      'settings',
      'myapp',
    ]);
    expect(titleTokens('Order 12345')).toEqual(['order']);
    expect(titleTokens(undefined)).toEqual([]);
  });
});

describe('buildFingerprint', () => {
  it('normalizes, dedupes and caps', () => {
    const fp = buildFingerprint('Team | App', ['Invite', 'invite', 'Role', 'Send invitation', '7']);
    expect(fp.anchors).toEqual(['invite', 'role', 'send invitation']);
    expect(fp.title).toBe('Team | App');
  });

  it('refuses to identify a screen it barely saw', () => {
    expect(isIdentifiable(buildFingerprint('App', ['Save', 'Cancel']))).toBe(false);
    expect(isIdentifiable(buildFingerprint('App', ['Save', 'Cancel', 'Role']))).toBe(true);
    expect(isIdentifiable(undefined)).toBe(false);
  });
});

describe('screenMatchScore', () => {
  const recorded = buildFingerprint('Acme Corp — Team | MyApp', [
    'Invite member',
    'Role',
    'Send invitation',
    'Team members',
  ]);

  it('THE POINT: the same screen in a DIFFERENT account still matches', () => {
    // Different company, different title, same screen — exactly the case equality would fail.
    const score = screenMatchScore(
      recorded,
      live('Globex Ltd — Team | MyApp', [
        'Dashboard',
        'Invite member',
        'Role',
        'Send invitation',
        'Team members',
      ]),
    );
    expect(score).toBeGreaterThanOrEqual(SCREEN_MATCH_MIN);
  });

  it('a different screen of the same app does NOT match', () => {
    const score = screenMatchScore(
      recorded,
      live('Acme Corp — Billing | MyApp', ['Dashboard', 'Payment method', 'Invoices', 'Plan']),
    );
    expect(score).toBeLessThan(SCREEN_MATCH_MIN);
  });

  it('extra labels on the live page cost nothing — apps add chrome, they rarely drop labels', () => {
    const bare = live('Team', ['Invite member', 'Role', 'Send invitation', 'Team members']);
    const busy = live('Team', [
      ...bare.anchors,
      'Search',
      'Notifications',
      'Help',
      'Account',
      'Upgrade',
    ]);
    expect(screenMatchScore(recorded, busy)).toBe(screenMatchScore(recorded, bare));
  });

  it('the title corroborates but can never carry the claim on its own', () => {
    // Identical title, none of the screen's controls present: not this screen.
    const titleOnly = screenMatchScore(recorded, live('Acme Corp — Team | MyApp', ['Nothing here']));
    expect(titleOnly).toBeLessThan(SCREEN_MATCH_MIN);
  });

  it('scores 0 rather than guessing when there is nothing to judge', () => {
    expect(screenMatchScore(undefined, live('Team', ['Invite member']))).toBe(0);
    expect(screenMatchScore(recorded, undefined)).toBe(0);
    expect(screenMatchScore(recorded, live('Team', []))).toBe(0);
    // Too few recorded anchors to identify anything, however well they match.
    expect(screenMatchScore(buildFingerprint('Team', ['Role']), live('Team', ['Role']))).toBe(0);
  });

  it('a merged wizard run recognises a screen INSIDE it, and nothing outside it', () => {
    // Two screens captured as one run (no route change between them). Coarse, but not a lie: a user
    // standing on either half IS inside this workflow, and the widget still has to resolve an
    // element that is actually on the page before it will place them on a step.
    const merged = buildFingerprint('App', [
      'Company name',
      'Company size',
      'Industry',
      'Card number',
      'Expiry',
      'Billing address',
    ]);
    const insideIt = live('App', ['Company name', 'Company size', 'Industry', 'Continue']);
    const somewhereElse = live('App', ['Invoices', 'Download', 'Payment history']);
    expect(screenMatchScore(merged, insideIt)).toBeGreaterThanOrEqual(SCREEN_MATCH_MIN);
    expect(screenMatchScore(merged, somewhereElse)).toBeLessThan(SCREEN_MATCH_MIN);
  });
});
