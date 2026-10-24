# Contributing

## Add a script

1. Fork this repo.
2. `npm install && npm run new -- <script-name>` creates `scripts/<script-name>/index.md` from the template (add `--platform iii|crow|teletype` for non-norns scripts). You can also copy `templates/entry.md` by hand.
3. Fill in the front matter. Names are unique across all platforms. For norns, the folder name and `name` must match the folder the script installs into, usually the repo name.
4. That's it: the script page shows your repo's README, so the front matter is all a PR needs. Optionally, add short "catalog notes" below the front matter (shown above the README), e.g. "needs crow v4" or "best with a 128 grid".
5. `npm run validate`, then open a pull request.

## The one rule: you own what you post

However a script was made, by hand or with AI, the person submitting it stands behind it. It runs on real hardware, does what the entry says, and you can answer questions about it and fix it.

## AI disclosure is required

| `ai:` | meaning |
|---|---|
| `none` | written without AI code generation (autocomplete-level help is fine) |
| `assisted` | made with meaningful help from AI tools, up to mostly generated code, reviewed and tested by you |

`unknown` is reserved for automatic imports. If your script was imported, claim it: set `source: submitted` and fill in `ai`.

## Update or remove an entry

Edit or delete your `scripts/<name>/` folder in a PR. Authors can always ask for their entry to be removed.

## Working on the site itself

No framework: `tools/build.mjs` renders plain HTML, `src/assets/app.js` filters the prerendered cards. `npm run dev` builds and serves locally.
