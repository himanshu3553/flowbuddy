import { describe, expect, it } from 'vitest';
import {
  displayRoute,
  isIdSegment,
  normalizePath,
  routeMatchStrength,
  routePattern,
} from '@flowbuddy/shared/route-pattern';
import { coldStartScore } from './retrieval';

/**
 * Route matching's invariants.
 *
 * WHY THIS FILE EXISTS. Routes were compared as strings in three places at once, so a workflow
 * recorded at `/projects/123/settings` was invisible to a user standing on `/projects/456/settings`
 * — the sense shard didn't serve it, the retrieval boost didn't fire, and the walkthrough printed
 * the founder's own record id at the end-user. The rule now lives in one module; these tests pin
 * the two things a future edit will reach for: collapsing it back to equality, and widening the
 * id classifier until two genuinely different screens read as one.
 *
 * Lives in @flowbuddy/synthesis only because that is where the repo's vitest runner is (the same
 * arrangement as `copilot-mode.test.ts`).
 */

describe('normalizePath', () => {
  it('trims trailing slashes and treats blank as root', () => {
    expect(normalizePath('/projects/')).toBe('/projects');
    expect(normalizePath('/projects///')).toBe('/projects');
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('  ')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });

  it('drops query and hash — contextPath comes from any page holding the public key', () => {
    expect(normalizePath('/projects?id=1')).toBe('/projects');
    expect(normalizePath('/projects#section')).toBe('/projects');
    expect(normalizePath('/?q=x')).toBe('/');
  });
});

describe('isIdSegment', () => {
  it('recognises the id shapes real apps put in URLs', () => {
    expect(isIdSegment('123')).toBe(true); // autoincrement
    expect(isIdSegment('6a6a49ca1a22045b0b32b353')).toBe(true); // Mongo ObjectId
    expect(isIdSegment('9f2c4e1a-3b7d-4c2e-8f11-2a4b6c8d0e12')).toBe(true); // UUID
    expect(isIdSegment('01H8XGJWBWBAQ4B0Z1M2K3')).toBe(true); // ULID
    expect(isIdSegment('ckl2j3k4j5k6xyz')).toBe(true); // cuid
  });

  it('NEVER treats a word or a slug as an id — a false positive fuses two screens into one', () => {
    expect(isIdSegment('settings')).toBe(false);
    expect(isIdSegment('billing')).toBe(false);
    expect(isIdSegment('v2')).toBe(false);
    expect(isIdSegment('api-keys-v2')).toBe(false);
    expect(isIdSegment('2024-year-in-review')).toBe(false); // digits, but slug-shaped
    expect(isIdSegment('documentation')).toBe(false); // 13 chars, no digit
    expect(isIdSegment('beadface')).toBe(false); // hex, but too short to be an id
    expect(isIdSegment('')).toBe(false);
  });

  it('misses separator-carrying tokens — the chosen failure direction (safe, = old behaviour)', () => {
    expect(isIdSegment('cus_NffrFeUfNV2Hib')).toBe(false);
    expect(isIdSegment('V1StGXR8_Z5jdHi6B-myT')).toBe(false);
  });
});

describe('routePattern', () => {
  it('replaces id segments and leaves screen segments alone', () => {
    expect(routePattern('/projects/6a6a49ca1a22045b0b32b353/settings')).toBe('/projects/:id/settings');
    expect(routePattern('/orders/42')).toBe('/orders/:id');
    expect(routePattern('/dashboard/analytics')).toBe('/dashboard/analytics');
    expect(routePattern('/')).toBe('/');
  });

  it('is IDEMPOTENT — the widget sends a pattern and the server patterns it again', () => {
    for (const p of ['/projects/123/settings', '/dashboard', '/', '/a/9f2c4e1a3b7d4c2e8f11']) {
      expect(routePattern(routePattern(p))).toBe(routePattern(p));
    }
  });
});

describe('routeMatchStrength', () => {
  it('THE BUG THIS ENDS: two records of one screen are the same screen', () => {
    expect(routeMatchStrength('/projects/123/settings', '/projects/456/settings')).toBe(2);
    expect(routeMatchStrength('/projects/6a6a49ca1a22045b0b32b353', '/projects/9f2c4e1a3b7d4c2e')).toBe(2);
  });

  it('still scores exact, prefix and unrelated the way ranking expects', () => {
    expect(routeMatchStrength('/dashboard/projects', '/dashboard/projects')).toBe(2);
    expect(routeMatchStrength('/dashboard/projects', '/dashboard')).toBe(1); // ancestor
    expect(routeMatchStrength('/dashboard', '/dashboard/projects/123')).toBe(1); // descendant
    expect(routeMatchStrength('/settings/billing', '/settings/team')).toBe(0);
    expect(routeMatchStrength('/projects/123/settings', '/projects/456/members')).toBe(0);
  });

  it('matches on segment boundaries, never raw substrings', () => {
    expect(routeMatchStrength('/projects', '/projects-archive')).toBe(0);
  });

  it('the root never prefix-matches — but two parties both AT the root are the same screen', () => {
    expect(routeMatchStrength('/', '/dashboard')).toBe(0);
    expect(routeMatchStrength('/dashboard', '/')).toBe(0);
    // Landing-page steps must be reachable by someone standing on the landing page (2026-08-05):
    // without the exact-root case, "Click Start Free" recorded at `/` told a user AT `/` to head
    // to `/` forever — in the walkthrough and the acting run alike.
    expect(routeMatchStrength('/', '/')).toBe(2);
    expect(routeMatchStrength('', '/dashboard')).toBe(0);
    expect(routeMatchStrength('/dashboard', '')).toBe(0);
    expect(routeMatchStrength('', '')).toBe(0); // unknown is not the root
  });
});

describe('displayRoute', () => {
  it('never shows an end-user a record id out of the founder’s account', () => {
    expect(displayRoute('/projects/6a6a49ca1a22045b0b32b353/settings')).toBe('/projects/…/settings');
    expect(displayRoute('/orders/42')).toBe('/orders/…');
    expect(displayRoute('/projects/:id/settings')).toBe('/projects/…/settings'); // already patterned
    expect(displayRoute('/dashboard/analytics')).toBe('/dashboard/analytics');
  });
});

describe('coldStartScore — the same id rule, one definition', () => {
  it('an id segment means you were already somewhere specific', () => {
    expect(coldStartScore('/dashboard/projects/6a6a49ca1a22045b0b32b353')).toBe(0);
    expect(coldStartScore('/orders/42/edit')).toBe(0);
  });

  it('shallower is more startable', () => {
    expect(coldStartScore('/')).toBe(3);
    expect(coldStartScore('/dashboard')).toBe(2);
    expect(coldStartScore('/dashboard/projects')).toBe(1);
    expect(coldStartScore('/dashboard/projects/new/step')).toBe(0);
  });
});
