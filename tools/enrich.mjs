// Fetch GitHub metadata (stars, last push, license, cover image) into .cache/github.json.
// Runs in CI before the build with GITHUB_TOKEN. The build works without it; cards just show less.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEntries, githubSlug, gh, readJSON } from './lib.mjs';

const cacheFile = path.join(ROOT, '.cache', 'github.json');
const cache = readJSON(cacheFile, {});
const maxAgeMs = 20 * 60 * 60 * 1000; // refresh roughly daily
const now = Date.now();

if (!process.env.GITHUB_TOKEN) console.warn('! GITHUB_TOKEN not set: unauthenticated API limit is 60 requests/hour.');

let fetched = 0;
for (const e of loadEntries()) {
  const slug = githubSlug(e.data?.repo);
  if (!slug) continue;
  const hit = cache[slug];
  if (hit && now - (hit.fetchedAt || 0) < maxAgeMs) continue;

  const res = await gh(`/repos/${slug}`);
  if (res.status === 403 || res.status === 429) {
    console.warn('! rate limited, stopping early; cached data is kept.');
    break;
  }
  if (!res.ok) {
    cache[slug] = { missing: res.status === 404, fetchedAt: now };
    continue;
  }
  const r = await res.json();
  const info = {
    stars: r.stargazers_count,
    pushedAt: r.pushed_at,
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
    archived: r.archived,
    defaultBranch: r.default_branch,
    topics: r.topics || [],
    fetchedAt: now,
  };
  // Pick up a cover/screenshot image at the repo root, if there is one. Entries can also set `cover:` explicitly.
  const contents = await gh(`/repos/${slug}/contents/`);
  if (contents.ok) {
    const files = await contents.json();
    const cover = files.find((f) => /^(cover|screenshot|norns[-_]?screen)[^/]*\.(png|gif|jpe?g)$/i.test(f.name));
    if (cover) info.cover = `https://raw.githubusercontent.com/${slug}/${info.defaultBranch}/${cover.path}`;
  }
  cache[slug] = info;
  fetched++;
}

fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log(`✓ enriched ${fetched} repos (${Object.keys(cache).length} cached).`);
