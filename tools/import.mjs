// Import scripts from external sources as new entries (never overwrites existing ones).
//
//   node tools/import.mjs [--dry-run] [--only community,awesome,github] [--limit N]
//
// Sources are configured in site.config.json -> import. Imported entries get
// `source: imported` and `ai: unknown`, and are proposed through a pull request
// by the nightly workflow so a human reviews them before they go live.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ENTRIES_DIR, loadConfig, loadEntries, normalizeRepo, stringifyFrontMatter, gh, TAG_RE, KNOWN_REQUIRES } from './lib.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const want = (s) => !only || only.has(s);

const cfg = loadConfig().import || {};
// every source here lists norns scripts; names are unique across all platforms
const existing = loadEntries();
const knownRepos = new Set(existing.filter((e) => e.platform === 'norns').map((e) => normalizeRepo(e.data?.repo)));
const usedSlugs = new Set(existing.map((e) => e.slug.toLowerCase())); // names are unique ignoring case
const today = new Date().toISOString().slice(0, 10);
const added = [];

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'script';
// entry names keep their case: on norns the name is the install folder, and paths are case-sensitive
const toName = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'script';
const cleanTags = (tags) => {
  const out = [...new Set((tags || []).map((t) => slugify(t).replace(/[_.]/g, '-')).filter((t) => TAG_RE.test(t) && !['norns', 'monome', 'monome-norns', 'norns-script', 'lua'].includes(t)))];
  return out.length ? out.slice(0, 8) : ['uncategorized'];
};
const clip = (s, n = 160) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || 'no description yet';
};

function add({ name, repo, author, description, tags, requires, discussion, docs, origin, onNameClash = 'suffix' }) {
  if (added.length >= limit) return;
  const norm = normalizeRepo(repo);
  if (!norm.startsWith('https://') || knownRepos.has(norm)) return;
  const owner = norm.split('/')[3] || 'unknown';
  let slug = toName(name);
  if (usedSlugs.has(slug.toLowerCase()) && onNameClash === 'skip') {
    console.log(`  ? skipped ${repo}: name "${slug}" is already taken (same script at a new URL?)`);
    return;
  }
  if (usedSlugs.has(slug.toLowerCase())) slug = toName(`${slug}-${owner}`);
  if (usedSlugs.has(slug.toLowerCase())) return;

  const data = {
    name: slug,
    platform: 'norns',
    repo: repo.replace(/\.git$/, '').replace(/\/+$/, ''),
    author: author || owner,
    description: clip(description),
    tags: cleanTags(tags),
  };
  // hardware tags (grid, arc, crow, midi...) double as the `requires` filter
  const req = requires ?? data.tags.filter((t) => KNOWN_REQUIRES.includes(t));
  if (req.length) data.requires = req;
  Object.assign(data, { ai: 'unknown', source: 'imported', origin, added: today });
  if (discussion?.startsWith('https://')) data.discussion = discussion;
  if (docs?.startsWith('https://')) data.docs = docs;

  knownRepos.add(norm);
  usedSlugs.add(slug.toLowerCase());
  added.push(data);
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'norns-catalog' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// 1. maiden-format catalogs (norns.community's community.json and friends)
if (want('community')) {
  for (const url of cfg.communityCatalogs || []) {
    try {
      const cat = JSON.parse(await fetchText(url));
      for (const e of cat.entries || []) {
        add({
          name: e.project_name,
          repo: e.project_url,
          // community.json sometimes has a stray "license" word in author ("tyleretters license")
          author: String(e.author || '').replace(/\blicense\b/gi, '').replace(/\s+/g, ' ').trim(),
          description: e.description,
          tags: e.tags || e.tag,
          discussion: e.discussion_url,
          docs: e.documentation_url,
          origin: cat.catalog_name ? `catalog:${cat.catalog_name}` : url,
        });
      }
      console.log(`· ${url}: ${(cat.entries || []).length} entries read`);
    } catch (err) {
      console.warn(`! ${err.message}`);
    }
  }
}

// 2. awesome-style markdown lists. p3r7/awesome-monome-norns has categorized tables with
//    reference-style links; anything else falls back to "- [name](https://github.com/owner/repo) - description".
if (want('awesome')) {
  for (const url of cfg.awesomeLists || []) {
    try {
      const md = await fetchText(url);
      const before = added.length;
      const rows = /^## _script_ List/m.test(md) ? parseAwesomeNorns(md) : parseAwesomeLinks(md);
      // the same script often lives at a new repo URL now; a name clash is more likely a move than a new script
      for (const r of rows) add({ ...r, origin: `awesome:${url.match(/github(?:usercontent)?\.com\/([^/]+\/[^/]+)/)?.[1] || url}`, onNameClash: 'skip' });
      console.log(`· ${url}: ${rows.length} scripts read, ${added.length - before} new`);
    } catch (err) {
      console.warn(`! ${err.message}`);
    }
  }
}

function parseAwesomeLinks(md) {
  const re = /\[([^\]]+)\]\((https:\/\/github\.com\/[\w.-]+\/[\w.-]+)\/?\)\s*(?:[-–—:]\s*(.*))?/g;
  return [...md.matchAll(re)].map((m) => ({ name: m[2].split('/')[4], repo: m[2], description: m[3] || m[1], tags: [] }));
}

function parseAwesomeNorns(md) {
  const refs = new Map([...md.matchAll(/^\[([^\]]+)\]:\s*<?(\S+?)>?\s*$/gm)].map((m) => [m[1].toLowerCase(), m[2]]));
  // first link in a table cell: [text](url), [text][ref] or [ref]
  const link = (cell) => {
    const m = cell.match(/\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]*)\])?/);
    if (!m) return { text: cell.trim(), url: null };
    return { text: m[1], url: m[2] || refs.get((m[3] || m[1]).toLowerCase()) || null };
  };
  const plain = (s) => s.replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])?/g, '$1').replace(/[_*`]/g, '').trim();
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const isRow = (line) => line.startsWith('|') && !/^\|\s*:?-{3}/.test(line);
  const CATEGORY_TAGS = {
    'synths & drones': ['synth', 'drone'],
    'granular sample players & synths': ['granulator', 'sampler'],
    'sample players': ['sampler'],
    'basic samplers': ['sampler'],
    sequencers: ['sequencer'],
    trackers: ['tracker', 'sequencer'],
    'control modulation sources': ['modulation'],
    'audio effects': ['audio-fx'],
    'loopers, live samplers & crazy delays': ['looper', 'delay'],
    'midi effects': ['midi'],
    utilities: ['utility'],
  };
  // "scripts by I/O" table: 🔴 marks hardware the script can't run without
  const IO_REQUIRES = { 'audio in': 'audio-in', 'midi sync': 'midi', 'midi in': 'midi', 'midi out': 'midi', keyboard: 'keyboard', grid: 'grid', arc: 'arc', crow: 'crow' };
  const requiresByApp = new Map();
  const io = md.split(/^## _scripts_ by I\/O/m)[1]?.split(/^## /m)[0] || '';
  let header = null;
  for (const line of io.split('\n').filter(isRow)) {
    const c = cells(line);
    if (c[0] === 'app') header = c.map((h) => h.toLowerCase());
    else if (header) {
      const req = c.flatMap((v, i) => (v.includes('🔴') && IO_REQUIRES[header[i]] ? [IO_REQUIRES[header[i]]] : []));
      requiresByApp.set(link(c[0]).text, [...new Set(req)]);
    }
  }

  const rows = [];
  const scripts = md.split(/^## _script_ List/m)[1].split(/^## /m)[0];
  let category = [];
  for (const line of scripts.split('\n')) {
    const h = line.match(/^####\s+(.*)/);
    if (h) category = CATEGORY_TAGS[plain(h[1]).toLowerCase()] || [];
    if (!isRow(line)) continue;
    const [appCell, , codeCell, descCell, , docCell] = cells(line);
    if (!codeCell || appCell === 'app') continue;
    const app = link(appCell);
    const code = link(codeCell).url;
    const gh = code?.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?(.*)$/);
    // links into a subfolder (engine collections, monorepos) are not installable as a script on their own
    if (!gh || gh[3]) {
      console.log(`  ~ skipped ${app.text}: code link ${code || '(none)'} is not a repo root`);
      continue;
    }
    const req = requiresByApp.get(app.text) || [];
    rows.push({
      name: gh[2],
      repo: `https://github.com/${gh[1]}/${gh[2]}`,
      description: plain(descCell),
      tags: [...category, ...req],
      requires: req,
      discussion: app.url?.startsWith('https://llllllll.co/') ? app.url : undefined,
      docs: link(docCell || '').url || undefined,
    });
  }
  return rows;
}

// 3. GitHub repositories by topic (needs GITHUB_TOKEN for sane rate limits)
if (want('github')) {
  for (const topic of cfg.githubTopics || []) {
    for (let page = 1; page <= 3; page++) {
      const res = await gh(`/search/repositories?q=topic:${encodeURIComponent(topic)}+fork:false&sort=updated&per_page=100&page=${page}`);
      if (!res.ok) {
        console.warn(`! GitHub search for topic:${topic} returned ${res.status}`);
        break;
      }
      const { items = [] } = await res.json();
      for (const r of items) {
        if (r.archived) continue;
        add({ name: r.name, repo: r.html_url, author: r.owner?.login, description: r.description, tags: r.topics, origin: `github-topic:${topic}` });
      }
      console.log(`· topic:${topic} page ${page}: ${items.length} repos`);
      if (items.length < 100) break;
    }
  }
}

if (!dryRun) {
  for (const data of added) {
    const dir = path.join(ROOT, ENTRIES_DIR, data.name);
    fs.mkdirSync(dir, { recursive: true });
    // no body: the script page shows the upstream README, and a "claim it" note for imported entries
    fs.writeFileSync(path.join(dir, 'index.md'), stringifyFrontMatter(data));
  }
}
console.log(`${dryRun ? '[dry run] would add' : '✓ added'} ${added.length} new entries.`);
for (const d of added.slice(0, 20)) console.log(`  + ${d.name}  (${d.origin})`);
if (added.length > 20) console.log(`  … and ${added.length - 20} more`);
