# AGENTS.md

Guidance for AI coding agents (Claude Code, Copilot, etc.) working on this repo.

## What this is

A community catalog of monome norns / grid / iii scripts, published as a **static site on GitHub Pages**. People add scripts with pull requests: one Markdown file per script with YAML front matter. The build produces:

- the website (prerendered HTML, client-side search and filters),
- `catalog.json`, a **maiden-compatible** script catalog (same shape as monome's `community.json`),
- `index.json`, the full catalog for other tools, and a `sitemap.xml`.

Working name: **splines** (placeholder; see `site.config.json`). Unofficial and not affiliated with monome. Keep that disclaimer in the footer.

AI-assisted scripts are welcome, but **AI disclosure is mandatory** (`ai:` field). That is a core product rule, not a detail.

## Commands

```sh
npm install
npm run validate            # schema + duplicate checks (offline)
npm run validate:online     # + checks repos exist and have a root .lua (uses GITHUB_TOKEN if set)
npm run enrich              # GitHub stars/last push/license/cover → .cache/github.json
npm run import -- --only community --limit 24   # seed/import entries; --dry-run to preview
npm run build               # → dist/
npm run serve               # → http://localhost:8080/<basePath>/
npm run dev                 # build + serve
npm run new -- <name> [--kind iii]   # scaffold an entry from templates/entry.md
```

Node ≥ 20. There is no test suite yet. Verify changes by running `validate` and `build`, then opening the site with `serve`. For a realistic dataset, run the importer without `--limit` in a scratch copy (≈350 entries from norns.community; all should validate).

## Layout

```
norns/<name>/index.md     one entry per norns script (+ optional images next to it)
iii/<name>/index.md       iii grid scripts (shown on site, NOT in catalog.json)
templates/entry.md        entry template used by `npm run new`
src/assets/               style.css, app.js (client filtering), favicon.svg
src/about.md              about/submit/maiden page ({{title}}, {{catalog}}, {{repo}} placeholders)
scripts/lib.mjs           config, entry loading, front matter, VALIDATION RULES (single source of truth)
scripts/validate.mjs      CLI validator (GitHub Actions annotations when GITHUB_ACTIONS is set)
scripts/enrich.mjs        GitHub API metadata cache (20h TTL)
scripts/import.mjs        importers: maiden catalogs, awesome-style markdown lists, GitHub topics
scripts/build.mjs         renders everything into dist/
scripts/serve.mjs         local static server honoring basePath
site.config.json          title, siteUrl, basePath, cname, repo, giscus, import sources
.github/workflows/        validate.yml (PRs), deploy.yml (push/daily → Pages), import.yml (weekly → PR)
```

## Data model (entry front matter)

| field | req | notes |
|---|---|---|
| `name` | ✓ | must equal the folder name; it's the folder the script installs into on norns (`dust/code/<name>`), so it must be unique among norns entries |
| `repo` | ✓ | https URL; norns repos need the main `.lua` at the root |
| `author` | ✓ | display name / handle |
| `description` | ✓ | one line, ≤160 chars |
| `tags` | ✓ | lowercase kebab-case list |
| `requires` | | hardware from `KNOWN_REQUIRES` in `lib.mjs` (grid, arc, crow, midi, …) |
| `ai` | ✓ | `none` \| `assisted` \| `generated`; `unknown` is allowed **only** with `source: imported` |
| `source` | | `submitted` (default) \| `imported` |
| `origin` | | where an import came from, e.g. `catalog:community`, `github-topic:norns` |
| `license`, `discussion`, `docs`, `cover`, `added` | | optional; URLs must be https |

The entry body (Markdown) is rendered on the script page.

The URL slug is the folder name: `/<kind>/<name>/`. Duplicate names and duplicate repos (per kind) are already rejected by `validate.mjs`.

When adding a field: update `validateEntry` in `lib.mjs`, `templates/entry.md`, the table in `README.md`/`src/about.md`, the record built in `build.mjs`, and, if relevant, `index.json`/`catalog.json`.

## Conventions and constraints

- **No framework, no client-side dependencies.** Plain Node ESM build, vanilla JS in the browser. Keep runtime deps minimal (currently `yaml`, `marked`). Discuss before adding any.
- **Cards are prerendered.** `app.js` only filters and sorts existing DOM nodes using `data-*` attributes on each `.card`. If you add a filter, add the `data-*` attribute in `card()` in `build.mjs` and the group in `app.js` (`PARAM` = URL param name, `MODE` = `any`/`all`). Filter state lives in the URL query (shareable links).
- **Everything user-supplied is untrusted.** Escape with `esc()` in templates. Markdown goes through the custom `marked` renderer that escapes raw HTML and neutralizes non-http(s) links. Never use `innerHTML` with entry data in `app.js`.
- **`catalog.json` shape is a contract with maiden.** Keep `file_info`, `catalog_name`, `date`, `entries[]` with `project_name`, `project_url`, `author`, `description`, `discussion_url?`, `documentation_url?`, `tags`. Only `KINDS[kind].maiden === true` entries go in it.
- **Paths:** always build site URLs with `href()` (prefixes `basePath`). `basePath` is `/norns-catalog` for a project Pages site, `""` with a custom domain.
- **Importer never overwrites** existing entries and dedupes by normalized repo URL. Imported entries are reviewed via the PR that `import.yml` opens.
- **The build must work offline.** GitHub metadata comes only from `.cache/github.json` (written by `enrich.mjs`). Missing cache just means fewer stats on cards.
- Styling: CSS custom properties on `:root`, with dark mode via `prefers-color-scheme` plus a `data-theme` override (toggle in header). Keep both themes working and the layout fine at 390px width.
- The author develops on **Windows**; keep scripts cross-platform (use `path`, normalize `\` to `/` for display paths, no shell-specific npm scripts).
- Commit style: short imperative subject, e.g. `build: add author pages`.

## Known gaps / TODO

- Confirm how maiden is configured with an extra catalog URL on the device, then document the exact steps in `src/about.md` (the `## installing with maiden` section).
- `import.awesomeLists` is empty: add the raw README URL of the awesome-monome-norns list once confirmed.
- Final name/domain: update `title`, `catalogName`, `siteUrl`, `basePath`, `cname`.
- giscus is wired but inactive until `site.config.json → giscus` is filled in.

## Roadmap (under discussion, not decided)

Proposals for the open ideas. Check with the maintainer before implementing any of these.

1. **Needs vs. "better with"**: split hardware into `requires` (won't work without) and `supports` (optional, "better with grid"). The hardware filter matches either; badges are styled differently.
2. **Platforms**: `kind` = where the code runs: `norns`, `iii`, `crow` (druid scripts). Grid/arc are controllers, so they stay in `requires`/`supports`, not in kinds. Only `norns` goes into the maiden catalog.
3. **Screenshots from norns**: document capturing the screen from maiden's REPL (`_norns.screen_export_png("/home/we/dust/<name>.png")`, verify the API on current norns), then copying it via SMB/SFTP. The 128×64 image renders crisp thanks to `image-rendering: pixelated`.
4. **Upstream README**: fetch each repo's README during `enrich.mjs` (cached), render it sanitized on the script page, and rewrite relative links/images to the repo's blob/raw URLs. The entry body becomes optional "catalog notes" shown above or instead of the README.
5. **Minimal PRs**: only front matter is required; the README is the documentation. This avoids duplicated, stale text in this repo.
6. **Author filter/pages**: clickable author on cards (`?author=` filter) plus `/authors/<author>/` pages.
7. **New & updated**: `/new/` (by `added`) and `/updated/` (by upstream push date) pages, plus Atom feeds (`feed-new.xml`, `feed-updated.xml`), useful for fediverse/RSS bots.
8. **Dynamic description**: don't rewrite entry files automatically. At build time, fall back to the GitHub repo description when `description` is missing, and keep the curated line when present.
