# splines — monome script catalog

A community catalog of scripts for monome norns, grid, iii, crow and teletype, published as a static site on GitHub Pages. Handmade and AI-assisted scripts are both welcome, and every entry discloses which it is.

- **One folder per script**: `scripts/<name>/index.md` with YAML front matter and free-form notes. A `platform` field says where it runs.
- **Submissions by pull request**: CI validates the entry and checks the repo.
- **Search and filters run in the browser**: text, tags, hardware, AI disclosure and sort, with shareable URLs (`?tag=grid&req=crow`).
- **Maiden-compatible catalog**: `catalog.json` uses the same shape as monome's `community.json`.
- **Importer**: proposes new scripts weekly from the official community catalog, awesome lists and GitHub topics.
- **Optional discussions per script** with [giscus](https://giscus.app), backed by GitHub Discussions, so there's no database.

No framework: one Node build script and two dependencies (`yaml`, `marked`).

## Quick start

```sh
npm install
npm run import -- --only community --limit 24   # seed some entries (optional)
npm run validate        # check all entries
npm run build           # → dist/
npm run serve           # → http://localhost:8080/ (plus basePath, if set)
npm run new -- my-script   # scaffold scripts/my-script/index.md (--platform iii|crow|teletype)
```

## Layout

```
scripts/<name>/index.md   one entry per script, any platform (+ optional screenshots)
templates/entry.md        entry template
src/assets/               style.css, app.js (filtering), favicon
src/about.md              about / submit / maiden page
tools/
  lib.mjs                 config, platforms, entry loading, validation rules
  validate.mjs            schema + duplicates; --online checks repos exist and have a root .lua
  enrich.mjs              stars / last push / license / cover / README → .cache/
  import.mjs              pull new entries from external sources
  build.mjs               HTML pages, catalog.json, index.json, sitemap
  serve.mjs               local preview server
site.config.json          title, URLs, giscus, import sources
```

## Entry format

```yaml
---
name: my-script            # = folder name = repo name, exact case (install folder on norns); unique ignoring case
platform: norns            # norns | iii | crow | teletype (default norns; only norns goes into catalog.json)
repo: https://github.com/you/my-script
author: you
description: one line, ≤160 chars
tags: [sequencer, generative]
requires: [grid, midi]     # optional hardware filter
ai: assisted               # none | assisted   (unknown = imported only)
license: MIT               # optional, otherwise read from GitHub
discussion: https://...    # optional
docs: https://...          # optional
cover: https://...         # optional screenshot
---
Optional short "catalog notes", shown above the repo's README on the script page.
```

## Deploying

1. Push to GitHub and enable **Settings → Pages → Source: GitHub Actions**.
2. Set `siteUrl` and `basePath` in `site.config.json`. For a custom domain, set `cname`, use `siteUrl: https://your.domain` and `basePath: ""`.
3. `deploy.yml` builds on every push to `main` and daily, to refresh stars and last-push dates.
4. `import.yml` runs weekly (or manually) and opens a PR with newly found scripts.
5. Allow Actions to create PRs: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**.

### Discussions (optional)

1. Enable Discussions on the repo and create a category, e.g. "Scripts" (Announcement type keeps new threads tidy).
2. Install the [giscus app](https://github.com/apps/giscus) on the repo.
3. Get `repoId` and `categoryId` from giscus.app and fill in `giscus` in `site.config.json`.

Threads are created on first comment and mapped to each page's path.

## TODO / to verify

- [ ] **Maiden catalog source config**: confirm where maiden reads extra catalog URLs on the device (its config file) and document the exact steps in `src/about.md`.
- [x] **awesome lists**: p3r7/awesome-monome-norns is imported (frozen since 2021, so it rarely adds anything new).
- [ ] Pick the final name and domain, then update `title`, `catalogName`, `siteUrl`, `basePath` and `cname`.
- [ ] Decide whether imported entries for mods and libraries should get their own `platform` value (or a `type:` field).
