// Fetch GitHub metadata (stars, last push, license, cover image) into .cache/github.json, and each repo's
// README into .cache/readme/<owner>/<repo>.md. Runs in CI before the build with GITHUB_TOKEN.
// The build works without it; cards just show less and script pages have no README.
//
//   node tools/enrich.mjs [--only name1,name2]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEntries, githubSlug, gh, readJSON, readmeFile } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

const cacheFile = path.join(ROOT, '.cache', 'github.json');
const cache = readJSON(cacheFile, {});
const maxAgeMs = 20 * 60 * 60 * 1000; // refresh roughly daily
const now = Date.now();

if (!process.env.GITHUB_TOKEN) console.warn('! GITHUB_TOKEN not set: unauthenticated API limit is 60 requests/hour.');

let fetched = 0;
let readmes = 0;
const seen = new Set();
for (const e of loadEntries()) {
  if (only && !only.has(e.slug)) continue;
  const slug = githubSlug(e.data?.repo);
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);
  const hit = cache[slug];
  const fresh = hit && now - (hit.fetchedAt || 0) < maxAgeMs;
  // entries cached before READMEs were fetched get their README on the next run, without waiting for the TTL
  if (fresh && (hit.missing || hit.readmeFetchedAt)) continue;

  let info = hit;
  if (!fresh) {
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
    info = {
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
    fetched++;
  }

  // The README is rendered on the script page; its path is kept so relative links can be resolved.
  const readme = await gh(`/repos/${slug}/readme`);
  if (readme.status === 403 || readme.status === 429) {
    cache[slug] = info;
    console.warn('! rate limited, stopping early; cached data is kept.');
    break;
  }
  const file = readmeFile(slug);
  if (readme.ok) {
    const r = await readme.json();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.content, 'base64').toString('utf8'));
    info.readmePath = r.path;
    readmes++;
  } else {
    fs.rmSync(file, { force: true });
    delete info.readmePath;
  }
  info.readmeFetchedAt = now;
  cache[slug] = info;
}

fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log(`✓ enriched ${fetched} repos, ${readmes} READMEs (${Object.keys(cache).length} cached).`);
