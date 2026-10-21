// Validate every entry. `--online` also checks that each repo exists and has a .lua script at its root.
// `--changed a.md,b.md` limits online checks to those files (used on pull requests).
import { PLATFORMS, loadEntries, validateEntry, normalizeRepo, githubSlug, gh } from './lib.mjs';

const args = process.argv.slice(2);
const online = args.includes('--online');
const changedArg = args[args.indexOf('--changed') + 1];
const changed = args.includes('--changed') && changedArg ? new Set(changedArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const inCI = !!process.env.GITHUB_ACTIONS;

const entries = loadEntries();
let failures = 0;

function report(entry, msg) {
  failures++;
  if (inCI) console.log(`::error file=${entry.file}::${msg}`);
  console.error(`✗ ${entry.file}: ${msg}`);
}

const seenRepo = new Map();
const seenName = new Map();
for (const e of entries) {
  for (const msg of validateEntry(e)) report(e, msg);
  if (!e.data) continue;
  const repo = normalizeRepo(e.data.repo);
  // one repo may hold e.g. a norns script and a crow script, so repos are only unique per platform
  const repoKey = `${e.platform} ${repo}`;
  if (repo && seenRepo.has(repoKey)) report(e, `duplicate repo, already listed in ${seenRepo.get(repoKey).file}`);
  else seenRepo.set(repoKey, e);
  if (e.data.name) {
    if (seenName.has(e.data.name)) report(e, `duplicate name, already used by ${seenName.get(e.data.name).file}`);
    else seenName.set(e.data.name, e);
  }
}

if (online) {
  const targets = entries.filter((e) => e.data && (!changed || changed.has(e.file)));
  for (const e of targets) {
    const slug = githubSlug(e.data.repo);
    if (!slug) {
      console.warn(`! ${e.file}: repo is not on GitHub, skipping online checks`);
      continue;
    }
    const res = await gh(`/repos/${slug}`);
    if (res.status === 404) {
      report(e, `repo ${e.data.repo} was not found (is it public?)`);
      continue;
    }
    if (!res.ok) {
      console.warn(`! ${e.file}: GitHub API returned ${res.status}, skipping`);
      continue;
    }
    if (PLATFORMS[e.platform]?.luaRoot) {
      const c = await gh(`/repos/${slug}/contents/`);
      if (c.ok) {
        const files = await c.json();
        if (!files.some((f) => f.type === 'file' && f.name.endsWith('.lua'))) {
          report(e, 'no .lua file at the repo root; norns needs the main script at the top level');
        }
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found in ${entries.length} entries.`);
  process.exit(1);
}
console.log(`✓ ${entries.length} entries valid${online ? ' (online checks done)' : ''}.`);
