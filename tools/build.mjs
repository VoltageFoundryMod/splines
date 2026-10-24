// Build the static site into dist/:
//   index.html            searchable, filterable list (cards are prerendered; JS only filters/sorts)
//   scripts/<slug>/       one page per script
//   about/                submission guide, AI disclosure levels, maiden setup
//   catalog.json          maiden-compatible catalog (norns scripts only)
//   index.json            the whole catalog as plain JSON, for other tools
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import {
  ROOT,
  ENTRIES_DIR,
  PLATFORMS,
  loadConfig,
  loadEntries,
  validateEntry,
  githubSlug,
  readJSON,
  readmeFile,
} from "./lib.mjs";

const cfg = loadConfig();
const DIST = path.join(ROOT, "dist");
const base = (cfg.basePath || "").replace(/\/+$/, "");
const siteUrl = (cfg.siteUrl || "").replace(/\/+$/, "");
const href = (p) => `${base}/${p.replace(/^\/+/, "")}`;
const cache = readJSON(path.join(ROOT, ".cache", "github.json"), {});
// likes = 👍/❤️/🎉/🚀 reactions on each script's giscus discussion, keyed by page path (written by enrich.mjs)
const discussions = readJSON(path.join(ROOT, ".cache", "discussions.json"), {});
const buildDate = new Date().toISOString();
const NEW_DAYS = 30; // cards get a "new" badge for this long after `added`

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeUrl = (u) =>
  /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(u || "") || !/^[a-z]+:/i.test(u || "")
    ? u
    : "#";

// While an upstream README renders, this holds { slug, branch, dir } so relative links and images point back
// at the repo, the way GitHub resolves them. null for entry notes.
let readmeCtx = null;

/** Rewrite a README URL: relative paths → github.com blob (links) or raw.githubusercontent.com (images). */
function fromRepo(u, raw) {
  if (!readmeCtx || !u || u.startsWith("#")) return u;
  const { slug, branch, dir } = readmeCtx;
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) {
    // images linked to a GitHub blob page don't render; use the raw file instead
    const blob =
      raw &&
      u.match(
        /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+?)(\?.*)?$/,
      );
    return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}` : u;
  }
  const [, p, rest = ""] = u.match(/^([^?#]*)(.*)$/);
  const file = path.posix
    .normalize(p.startsWith("/") ? p.slice(1) : path.posix.join(dir, p))
    .replace(/^(\.\.\/)+|^\.$/g, "");
  return raw
    ? `https://raw.githubusercontent.com/${slug}/${branch}/${file}`
    : `https://github.com/${slug}/blob/${branch}/${file}${rest}`;
}

const attr = (tag, name) => {
  const m = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return m && (m[1] ?? m[2] ?? m[3]);
};
const imgTag = (src, alt, title, width) =>
  `<img src="${esc(safeUrl(src))}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ""}${width ? ` width="${width}"` : ""} loading="lazy">`;

// Raw HTML is never passed through. In READMEs, <img> tags are rebuilt from their src/alt/width, other tags are
// dropped and their text kept (escaped, entities like &nbsp; still work). In entry notes it shows as text,
// except <!-- comments -->, which are dropped everywhere (the entry template uses one for its hint).
function rawHtml(text) {
  text = text.replace(/<!--[\s\S]*?(-->|$)/g, "");
  if (!readmeCtx) return esc(text);
  return text
    .replace(/<(script|style)\b[\s\S]*?(<\/\1>|$)/gi, "")
    .split(/(<img\b[^>]*>)/i)
    .map((part, i) => {
      if (i % 2)
        return imgTag(
          fromRepo(attr(part, "src"), true),
          attr(part, "alt") || "",
          null,
          attr(part, "width")?.match(/^\d+$/)?.[0],
        );
      return esc(part.replace(/<\/?[a-z][^>]*>/gi, "")).replace(
        /&amp;(#?\w+);/g,
        "&$1;",
      );
    })
    .join("");
}

// Markdown: no raw HTML, no javascript: links.
const md = new Marked({ gfm: true });
md.use({
  renderer: {
    html: ({ text }) => rawHtml(text),
    heading({ tokens, depth, text }) {
      // the page already has an <h1>; README headings move down one level
      if (readmeCtx) depth = Math.min(depth + 1, 6);
      const id = text
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return `<h${depth} id="${esc(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    link({ href: h, title, tokens }) {
      const t = title ? ` title="${esc(title)}"` : "";
      return `<a href="${esc(safeUrl(fromRepo(h, false)))}"${t} rel="nofollow ugc">${this.parser.parseInline(tokens)}</a>`;
    },
    // marked hands over alt text already escaped
    image: ({ href: h, title, text }) =>
      imgTag(
        fromRepo(h, true),
        text.replace(
          /&(amp|lt|gt|quot|#39);/g,
          (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e],
        ),
        title,
      ),
  },
});

/** The repo's README as sanitized HTML, from the enrich cache ('' when not cached). */
function renderReadme(slug, info) {
  if (!slug || !info.readmePath || !fs.existsSync(readmeFile(slug))) return "";
  readmeCtx = {
    slug,
    branch: info.defaultBranch || "HEAD",
    dir: path.posix.dirname(info.readmePath),
  };
  try {
    return md.parse(fs.readFileSync(readmeFile(slug), "utf8"));
  } finally {
    readmeCtx = null;
  }
}

const AI_LABEL = {
  none: ["handmade", "Written without AI code generation"],
  assisted: [
    "ai-assisted",
    "Made with help from AI tools, reviewed and tested by the author",
  ],
  unknown: [
    "undisclosed",
    "Imported automatically; the author has not disclosed AI use yet",
  ],
};

// ---------- collect ----------
const records = [];
for (const e of loadEntries()) {
  const errs = validateEntry(e);
  if (errs.length) {
    console.warn(`! skipping ${e.file}: ${errs[0]}`);
    continue;
  }
  const d = e.data;
  const ghSlug = githubSlug(d.repo);
  const gh = cache[ghSlug] || {};
  records.push({
    platform: e.platform,
    slug: e.slug,
    name: d.name,
    author: d.author,
    description: d.description,
    tags: d.tags.map(String),
    requires: d.requires || [],
    ai: d.ai,
    source: d.source || "submitted",
    origin: d.origin || null,
    repo: d.repo,
    discussion: d.discussion || null,
    docs: d.docs || null,
    license: d.license || gh.license || null,
    cover: d.cover || gh.cover || null,
    stars: gh.stars ?? null,
    likes: discussions[`${ENTRIES_DIR}/${e.slug}/`]?.likes ?? 0,
    updated: gh.pushedAt ? gh.pushedAt.slice(0, 10) : null,
    archived: !!gh.archived,
    added: d.added ? String(d.added).slice(0, 10) : null,
    path: `${ENTRIES_DIR}/${e.slug}/`,
    body: e.body.replace(/<!--[\s\S]*?(-->|$)/g, ""), // the template's hint is a comment; it must not count as notes
    readme: renderReadme(ghSlug, gh),
    dir: path.join(ROOT, ENTRIES_DIR, e.slug),
  });
}
records.sort((a, b) => a.name.localeCompare(b.name));

// ---------- helpers ----------
const tagCounts = new Map();
const reqCounts = new Map();
for (const r of records) {
  for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  for (const q of r.requires) reqCounts.set(q, (reqCounts.get(q) || 0) + 1);
}

function layout({ title, description, body, canonical }) {
  const fullTitle = title
    ? `${title} · ${cfg.title}`
    : `${cfg.title} · ${cfg.tagline}`;
  return `<!doctype html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-W2K0HFNKCE"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-W2K0HFNKCE');
</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || cfg.description)}">
${canonical != null && siteUrl ? `<link rel="canonical" href="${esc(siteUrl + "/" + canonical)}">` : ""}
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || cfg.description)}">
<link rel="icon" href="${href("assets/favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${href("assets/style.css")}">
${
  siteUrl
    ? `<link rel="alternate" type="application/atom+xml" title="${esc(cfg.title)}: new scripts" href="${href("feed-new.xml")}">
<link rel="alternate" type="application/atom+xml" title="${esc(cfg.title)}: recently updated" href="${href("feed-updated.xml")}">`
    : ""
}
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<header class="site-header">
  <a class="brand" href="${href("")}"><img class="brand-mark" src="${href("assets/favicon.svg")}" alt="" width="28" height="28">${esc(cfg.title)}</a>
  <nav>
    <a href="${href("")}">scripts</a>
    <a href="${href("new/")}">new</a>
    <a href="${href("updated/")}">updated</a>
    <a href="${href("about/")}">about &amp; submit</a>
    <a href="https://github.com/${esc(cfg.repo)}">github</a>
    <button class="theme-toggle" type="button" aria-label="Toggle dark mode" title="Toggle theme"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Unofficial and community-run. Not affiliated with or endorsed by monome. Scripts belong to their authors; check each repo's license.</p>
  <p><a href="${href("catalog.json")}">maiden catalog</a> · <a href="${href("index.json")}">index.json</a> · <a href="https://github.com/${esc(cfg.repo)}/blob/${esc(cfg.branch)}/CONTRIBUTING.md">contribute</a></p>
</footer>
<script src="${href("assets/app.js")}" defer></script>
</body>
</html>
`;
}

const aiBadge = (ai) =>
  `<span class="badge ai ai-${esc(ai)}" title="${esc(AI_LABEL[ai][1])}">${esc(AI_LABEL[ai][0])}</span>`;
const tagLink = (t) =>
  `<a class="tag" href="${href(`?tag=${encodeURIComponent(t)}`)}">${esc(t)}</a>`;
const isNew = (r) =>
  !!r.added && Date.parse(buildDate) - Date.parse(r.added) < NEW_DAYS * 864e5;
const likesStat = (r) =>
  r.likes
    ? `<span class="stat likes" title="Likes on ${esc(cfg.title)}: reactions in the script's discussion">♥ ${r.likes}</span>`
    : "";

function card(r) {
  const search = [r.name, r.author, r.description, ...r.tags, ...r.requires]
    .join(" ")
    .toLowerCase();
  return `<li class="card" data-platform="${esc(r.platform)}" data-ai="${esc(r.ai)}" data-tags="${esc(r.tags.join(" "))}" data-requires="${esc(r.requires.join(" "))}" data-name="${esc(r.name)}" data-stars="${r.stars ?? 0}" data-likes="${r.likes}" data-updated="${esc(r.updated || "")}" data-added="${esc(r.added || "")}" data-search="${esc(search)}">
  <a class="card-link" href="${href(r.path)}">
    <span class="card-title">${esc(r.name)}${isNew(r) ? ` <span class="badge new" title="Added ${esc(r.added)}">new</span>` : ""}</span>
    <span class="card-author">by ${esc(r.author)}</span>
  </a>
  <p class="card-desc">${esc(r.description)}</p>
  <div class="card-meta">
    ${aiBadge(r.ai)}${r.platform !== "norns" ? `<span class="badge kind">${esc(PLATFORMS[r.platform].label)}</span>` : ""}
    ${r.requires.map((q) => `<span class="badge req">${esc(q)}</span>`).join("")}
    ${likesStat(r)}
    ${r.stars != null ? `<span class="stat" title="GitHub stars">★ ${r.stars}</span>` : ""}
    ${r.updated ? `<span class="stat" title="Last push">${esc(r.updated)}</span>` : ""}
  </div>
  <div class="card-tags">${r.tags
    .filter((t) => !r.requires.includes(t))
    .map(tagLink)
    .join("")}</div>
</li>`;
}

/** The n most recent records by a date field ("added" or "updated"), newest first. */
const latest = (key, n) =>
  records
    .filter((r) => r[key])
    .sort((a, b) => b[key].localeCompare(a[key]) || a.name.localeCompare(b.name))
    .slice(0, n);

function freshPanel(title, page, feed, items, date) {
  if (!items.length) return "";
  return `<div class="fresh-panel">
    <h2><a href="${href(page)}">${esc(title)}</a>${siteUrl ? ` <a class="feed" href="${href(feed)}" title="Atom feed">feed</a>` : ""}</h2>
    <ol>${items.map((r) => `<li><a href="${href(r.path)}">${esc(r.name)}</a> <span class="fresh-by">by ${esc(r.author)}</span> <time datetime="${esc(date(r))}">${esc(date(r))}</time></li>`).join("")}</ol>
    <a class="fresh-more" href="${href(page)}">see all →</a>
  </div>`;
}

function chipGroup(name, label, counts, min = 1) {
  const items = [...counts]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!items.length) return "";
  return `<fieldset class="chips" data-group="${name}">
  <legend>${esc(label)}</legend>
  ${items.map(([v, n]) => `<button type="button" class="chip" data-value="${esc(v)}" aria-pressed="false">${esc(v)} <span class="count">${n}</span></button>`).join("")}
</fieldset>`;
}

// ---------- write ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "src", "assets"), path.join(DIST, "assets"), {
  recursive: true,
});
const write = (rel, content) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};

// index
const aiCounts = new Map(
  Object.keys(AI_LABEL).map((k) => [
    k,
    records.filter((r) => r.ai === k).length,
  ]),
);
const platformCounts = new Map(
  Object.keys(PLATFORMS).map((k) => [
    k,
    records.filter((r) => r.platform === k).length,
  ]),
);
write(
  "index.html",
  layout({
    canonical: "",
    body: `
<section class="hero">
  <h1>${esc(cfg.tagline)}</h1>
  <p>${records.length} scripts. Search, filter by tag or hardware, and install straight from maiden. Handmade or AI-assisted, always disclosed. <a href="${href("about/")}">How it works</a></p>
</section>
<section class="fresh" aria-label="What's new">
  ${freshPanel("just added", "new/", "feed-new.xml", latest("added", 5), (r) => r.added)}
  ${freshPanel("recently updated", "updated/", "feed-updated.xml", latest("updated", 5), (r) => r.updated)}
</section>
<section class="controls" aria-label="Search and filters">
  <div class="search-row">
    <div class="search-box">
      <input id="q" type="search" placeholder="search scripts, authors, tags…" autocomplete="off" aria-label="Search">
      <button id="q-clear" class="search-clear" type="button" aria-label="Clear search" title="Clear search" hidden>×</button>
    </div>
    <select id="sort" aria-label="Sort">
      <option value="name">name</option>
      <option value="updated">recently updated</option>
      <option value="added">recently added</option>
      <option value="likes">most liked</option>
      <option value="stars">most GitHub stars</option>
    </select>
  </div>
  <div class="filter-row">
    ${chipGroup("platform", "platform", new Map([...platformCounts].filter(([, n]) => n > 0)))}
    <fieldset class="chips" data-group="ai">
      <legend>AI disclosure</legend>
      ${[...aiCounts]
        .filter(([, n]) => n > 0)
        .map(
          ([k, n]) =>
            `<button type="button" class="chip" data-value="${k}" aria-pressed="false" title="${esc(AI_LABEL[k][1])}">${esc(AI_LABEL[k][0])} <span class="count">${n}</span></button>`,
        )
        .join("")}
    </fieldset>
    ${chipGroup("requires", "hardware", reqCounts)}
  </div>
  <details class="tag-panel">
    <summary>tags <span class="count">${tagCounts.size}</span></summary>
    ${chipGroup("tags", "tags (all selected must match)", tagCounts)}
  </details>
  <p class="status"><span id="count">${records.length}</span> shown <button id="clear" type="button" class="link-button" hidden>clear filters</button></p>
</section>
<ul id="results" class="cards">
${records.map(card).join("\n")}
</ul>
<p id="empty" class="empty" hidden>Nothing matches. Try fewer filters, or <a href="${href("about/")}">add the script you were looking for</a>.</p>
`,
  }),
);

// entry pages
const giscusReady =
  cfg.giscus && cfg.giscus.repo && cfg.giscus.repoId && cfg.giscus.categoryId;
for (const r of records) {
  const ghSlug = githubSlug(r.repo);
  const editUrl = esc(
    `https://github.com/${cfg.repo}/edit/${cfg.branch}/${ENTRIES_DIR}/${r.slug}/index.md`,
  );
  const install =
    r.platform === "norns"
      ? `<section class="install">
  <h2>install</h2>
  <p>In maiden's REPL (the <code>&gt;&gt;</code> prompt at the bottom of the editor), run:</p>
  <div class="copy-row"><code class="cmd">;install ${esc(r.repo)}</code><button type="button" class="copy" data-copy=";install ${esc(r.repo)}">copy</button></div>
  <p class="hint">Or add the <a href="${href("about/#installing-with-maiden")}">${esc(cfg.title)} catalog</a> to maiden and install it from the project manager. Restart norns if the script ships a new engine.</p>
</section>`
      : `<section class="install"><h2>install</h2><p>Get the script from <a href="${esc(r.repo)}">its repository</a> and follow its README.</p></section>`;

  const discussion = giscusReady
    ? `<section class="discussion" id="discussion"><h2>discussion</h2>
<p class="hint">Like this script? React with 👍 or ❤️ below (needs a GitHub account). Reactions count as likes (♥) on ${esc(cfg.title)}, updated daily.</p>
<script src="https://giscus.app/client.js" data-repo="${esc(cfg.giscus.repo)}" data-repo-id="${esc(cfg.giscus.repoId)}" data-category="${esc(cfg.giscus.category)}" data-category-id="${esc(cfg.giscus.categoryId)}" data-mapping="pathname" data-strict="1" data-reactions-enabled="1" data-emit-metadata="0" data-input-position="top" data-theme="preferred_color_scheme" data-lang="en" data-loading="lazy" crossorigin="anonymous" async></script>
</section>`
    : "";

  const meta = [
    ["author", esc(r.author)],
    ["repository", `<a href="${esc(r.repo)}">${esc(ghSlug || r.repo)}</a>`],
    r.license && ["license", esc(r.license)],
    r.stars != null && ["stars", `★ ${r.stars}`],
    r.updated && ["last push", esc(r.updated)],
    r.docs && ["docs", `<a href="${esc(r.docs)}">documentation</a>`],
    r.discussion && [
      "thread",
      `<a href="${esc(r.discussion)}">external discussion</a>`,
    ],
    r.requires.length && [
      "requires",
      r.requires
        .map((q) => `<span class="badge req">${esc(q)}</span>`)
        .join(" "),
    ],
    [
      "source",
      r.source === "imported"
        ? `imported${r.origin ? ` from <code>${esc(r.origin)}</code>` : ""}`
        : "submitted by the author",
    ],
  ].filter(Boolean);

  write(
    `${r.path}index.html`,
    layout({
      title: r.name,
      description: r.description,
      canonical: r.path,
      body: `
<article class="entry">
  <p class="crumbs"><a class="back" href="${href("")}" data-back>← all scripts</a> <span class="crumb-sep">/</span> ${esc(PLATFORMS[r.platform].label)}</p>
  <header class="entry-head">
    <h1>${esc(r.name)}${isNew(r) ? ` <span class="badge new" title="Added ${esc(r.added)}">new</span>` : ""}</h1>
    <p class="lede">${esc(r.description)}</p>
    <div class="card-meta">${aiBadge(r.ai)} <span class="ai-note">${esc(AI_LABEL[r.ai][1])}</span>${giscusReady ? ` <a class="like-link" href="#discussion" title="React in the discussion to like it">♥ ${r.likes || ""} like</a>` : likesStat(r)}</div>
    ${r.archived ? '<p class="warn">This repository is archived and may no longer be maintained.</p>' : ""}
  </header>
  ${r.cover ? `<img class="cover" src="${esc(r.cover)}" alt="${esc(r.name)} screenshot" loading="lazy">` : ""}
  <div class="entry-grid">
    <div class="entry-main">
      ${install}
      ${r.body.trim() ? `<section class="notes"><h2>catalog notes</h2><div class="prose">${md.parse(r.body)}</div></section>` : ""}
      ${
        r.readme
          ? `<section class="readme"><h2>readme <span class="readme-src">from <a href="${esc(r.repo)}">${esc(ghSlug || r.repo)}</a></span></h2><div class="prose">${r.readme}</div></section>`
          : `<section class="readme"><h2>readme</h2><p class="hint">Documentation lives in <a href="${esc(r.repo)}">the repository</a>.</p></section>`
      }
      ${discussion}
    </div>
    <aside class="entry-side">
      <dl>${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="card-tags">${r.tags.map(tagLink).join("")}</div>
      ${r.source === "imported" ? `<p class="claim">Is this your script? <a href="${editUrl}">Claim it</a>: set <code>source: submitted</code> and fill in the <code>ai</code> disclosure.</p>` : ""}
      <p class="edit"><a href="${editUrl}">suggest an edit</a></p>
    </aside>
  </div>
</article>`,
    }),
  );

  // copy images that live next to the entry (screenshots referenced from the notes)
  for (const f of fs.readdirSync(r.dir)) {
    if (/\.(png|gif|jpe?g|webp)$/i.test(f))
      fs.copyFileSync(path.join(r.dir, f), path.join(DIST, r.path, f));
  }
}

// new & recently updated: static pages plus Atom feeds (for feed readers and fediverse bots)
const FEED_SIZE = 50;
const newest = (key) => latest(key, FEED_SIZE);
const lists = [
  {
    page: "new/",
    feed: "feed-new.xml",
    title: "new scripts",
    intro: "The latest scripts added to the catalog.",
    empty: "Nothing new yet. Scripts added from now on show up here.",
    items: newest("added"),
    date: (r) => r.added,
    // one entry per script: being added happens once
    id: (r) => `${siteUrl}/${r.path}`,
  },
  {
    page: "updated/",
    feed: "feed-updated.xml",
    title: "recently updated",
    intro: "Scripts whose repositories received pushes most recently.",
    empty: "No update data yet (it comes from GitHub during the deploy).",
    items: newest("updated"),
    date: (r) => r.updated,
    // a new entry for each update day, so feed readers show repeat updates
    id: (r) => `${siteUrl}/${r.path}#updated-${r.updated}`,
  },
];
for (const l of lists) {
  const feedLink = siteUrl ? ` <a href="${href(l.feed)}">Atom feed</a>` : "";
  write(
    `${l.page}index.html`,
    layout({
      title: l.title,
      description: l.intro,
      canonical: l.page,
      body: `
<section class="hero">
  <h1>${esc(l.title)}</h1>
  <p>${esc(l.intro)}${feedLink}</p>
</section>
${l.items.length ? `<ul class="cards">\n${l.items.map(card).join("\n")}\n</ul>` : `<p class="empty">${esc(l.empty)}</p>`}
`,
    }),
  );
  if (!siteUrl) continue;
  const entries = l.items.map(
    (r) => `  <entry>
    <title>${esc(r.name)}</title>
    <id>${esc(l.id(r))}</id>
    <link href="${esc(`${siteUrl}/${r.path}`)}"/>
    <updated>${esc(l.date(r))}T00:00:00Z</updated>
    <author><name>${esc(r.author)}</name></author>
    <summary>${esc(r.description)}</summary>
${r.tags.map((t) => `    <category term="${esc(t)}"/>`).join("\n")}
  </entry>`,
  );
  write(
    l.feed,
    `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(`${cfg.title}: ${l.title}`)}</title>
  <subtitle>${esc(l.intro)}</subtitle>
  <id>${esc(`${siteUrl}/${l.feed}`)}</id>
  <link rel="self" href="${esc(`${siteUrl}/${l.feed}`)}"/>
  <link href="${esc(`${siteUrl}/${l.page}`)}"/>
  <updated>${l.items.length ? `${esc(l.date(l.items[0]))}T00:00:00Z` : buildDate}</updated>
${entries.join("\n")}
</feed>
`,
  );
}

// about
const aboutMd = fs
  .readFileSync(path.join(ROOT, "src", "about.md"), "utf8")
  .replaceAll("{{title}}", cfg.title)
  .replaceAll("{{catalog}}", `${siteUrl}/catalog.json`)
  .replaceAll("{{repo}}", cfg.repo)
  .replaceAll("{{branch}}", cfg.branch);
write(
  "about/index.html",
  layout({
    title: "about & submit",
    canonical: "about/",
    body: `<article class="prose about">${md.parse(aboutMd)}</article>`,
  }),
);

// 404
write(
  "404.html",
  layout({
    title: "not found",
    body: `<section class="hero"><h1>not found</h1><p>That page isn't here. <a href="${href("")}">Back to all scripts</a>.</p></section>`,
  }),
);

// maiden catalog (same shape as monome's community.json)
const catalog = {
  file_info: { version: 1, kind: "script_catalog" },
  catalog_name: cfg.catalogName,
  date: buildDate,
  entries: records
    .filter((r) => PLATFORMS[r.platform].maiden)
    .map((r) => ({
      project_name: r.name,
      project_url: r.repo,
      author: r.author,
      description: r.description,
      ...(r.discussion ? { discussion_url: r.discussion } : {}),
      documentation_url: siteUrl ? `${siteUrl}/${r.path}` : r.docs || undefined,
      tags: r.tags,
    })),
};
write("catalog.json", JSON.stringify(catalog, null, 2));

// plain index for other tools
write(
  "index.json",
  JSON.stringify(
    {
      generated: buildDate,
      count: records.length,
      entries: records.map(({ body, readme, dir, ...r }) => ({
        ...r,
        url: siteUrl ? `${siteUrl}/${r.path}` : r.path,
      })),
    },
    null,
    2,
  ),
);

// sitemap, GitHub Pages extras
if (siteUrl) {
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["", "about/", "new/", "updated/", ...records.map((r) => r.path)].map((p) => `  <url><loc>${esc(`${siteUrl}/${p}`)}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
}
write(".nojekyll", "");
if (cfg.cname) write("CNAME", cfg.cname + "\n");

console.log(
  `✓ built ${records.length} entries into dist/ (${catalog.entries.length} in the maiden catalog)`,
);
