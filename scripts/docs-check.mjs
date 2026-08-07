#!/usr/bin/env node
/**
 * docs:check — the mechanical half of "one fact, one home".
 *
 * WHY THIS EXISTS. The owners table in CLAUDE.md assigns each kind of fact a single home, and it
 * is the right rule — but a rule nothing enforces is a rule that drifts. The evidence: the fact
 * "an approval names a workflow identity, not a position" HAD an owner, and still reached ten docs
 * and stayed wrong in nine of them after the migration; the liveness-reader count had a home and
 * still went stale in three files at once. Owners tell you where a fact belongs; they cannot tell
 * you that a POINTER to that home has rotted. This does.
 *
 * It is deliberately NOT CI (the no-CI decision stands — docs/roadmap.md). It is a local script
 * you run beside `pnpm typecheck`, and it only ever reports things a machine can be certain about:
 *
 *   1. RELATIVE LINKS — every `[text](path.md)` in docs/ and CLAUDE.md resolves to a real file.
 *   2. HEADING ANCHORS — every `path.md#anchor` resolves to a real heading in that file.
 *   3. SECTION POINTERS — every `roadmap.md §N` (the repo's `Status: roadmap.md §N` convention)
 *      names a section that actually exists. This is the check that would have caught the
 *      renumbering hazard: a renumber leaves the LINK valid and the MEANING wrong, which no link
 *      checker in the world reports.
 *   4. ORPHANS — every doc is reachable from docs/README.md, which owns "which doc holds what".
 *
 * Exit 1 on any failure. Nothing here judges prose; drift of MEANING is still a human's job.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DOCS = join(ROOT, 'docs');
/**
 * Not orphan-checked, for two different reasons:
 *  - `archive` + `audit` are frozen dated snapshots, kept for their findings and never rewritten.
 *  - `design_system` is a design-TOOL export (its own README indexes it, and the component prompt
 *    files are consumed by the tool rather than read as prose). The map links the folder, not each
 *    file — so "nothing links to it" is the normal, correct state there.
 */
const FROZEN = ['docs/archive', 'docs/audit', 'docs/design_system'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

/** GitHub's heading→anchor rule, near enough: lowercase, strip punctuation, spaces to dashes. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s·-]/g, '')
    .replace(/\s+/g, '-');
}

const files = [join(ROOT, 'CLAUDE.md'), ...walk(DOCS)];
const headings = new Map(); // file -> Set of anchors
const sectionNumbers = new Map(); // file -> Set of top-level section numbers ("5", "11b")

for (const f of files) {
  const anchors = new Set();
  const sections = new Set();
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!h) continue;
    anchors.add(slug(h[2]));
    // "## 5. Phase 4" / "## 11b. Something" — the §N convention's targets.
    const n = /^#{1,6}\s+(\d+[a-z]?)[.．]\s/.exec(line);
    if (n) sections.add(n[1].toLowerCase());
  }
  headings.set(f, anchors);
  sectionNumbers.set(f, sections);
}

const problems = [];
const linkedTo = new Set();

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);

  // ── 1 + 2: relative links and their anchors ────────────────────────────────────────────────
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const [pathPart, anchor] = raw.split('#');
    if (!pathPart) continue;
    const target = resolve(dirname(f), pathPart);
    if (!existsSync(target)) {
      problems.push(`${rel}: broken link → ${raw}`);
      continue;
    }
    if (target.endsWith('.md')) linkedTo.add(target);
    if (anchor && target.endsWith('.md')) {
      const anchors = headings.get(target);
      if (anchors && !anchors.has(anchor.toLowerCase())) {
        problems.push(`${rel}: link anchor not found → ${raw}`);
      }
    }
  }

  // ── 3: the §N convention. "roadmap.md §5" / "roadmap.md) §5" / "Status: roadmap.md §9" ──────
  // Matched loosely on purpose: the pointer is written in prose, and a renumber must be caught
  // wherever it is phrased.
  for (const m of src.matchAll(/([\w./-]+\.md)\)?[^§\n]{0,40}§\s?(\d+[a-z]?)/g)) {
    const target = resolve(dirname(f), m[1]);
    if (!existsSync(target)) continue; // the link check above already reported it
    const secs = sectionNumbers.get(target);
    if (!secs || secs.size === 0) continue; // that doc doesn't use numbered sections
    if (!secs.has(m[2].toLowerCase())) {
      problems.push(
        `${rel}: §-pointer names a section that does not exist → ${m[1]} §${m[2]} ` +
          `(has: ${[...secs].sort().join(', ')})`,
      );
    }
  }
}

// ── 4: orphans — every doc reachable from the map ────────────────────────────────────────────
const mapFile = join(DOCS, 'README.md');
for (const f of files) {
  const rel = relative(ROOT, f);
  if (f === mapFile || rel === 'CLAUDE.md') continue;
  if (FROZEN.some((p) => rel.startsWith(p))) continue;
  if (!linkedTo.has(f)) problems.push(`${rel}: orphan — nothing links to it (docs/README.md owns the map)`);
}

if (problems.length > 0) {
  console.error(`docs:check — ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
  for (const p of problems.sort()) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}
console.log(`docs:check — ${files.length} docs, all links, anchors, §-pointers and map entries resolve.`);
