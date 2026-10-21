---
# Must match this folder's name: the repo name, with the same upper/lowercase. For norns it's the folder the script installs into.
name: my-script
# Where the code runs: norns | iii | crow | teletype
platform: norns
# Public repository (or other https link). For norns, the main .lua script must be at its root.
repo: https://github.com/you/my-script
author: you
# One line, 160 characters max.
description: what it does, in one line
# Lowercase kebab-case. Pick a few: sequencer, generative, looper, sampler, delay, granular, synth, drums, utility, midi, game...
tags: [sequencer]
# Optional hardware it uses or needs: grid, arc, crow, midi, audio-in, keyboard, jf, ansible, teletype, hid, osc, txo, er-301
requires: [grid]
# Required disclosure: none | assisted | generated   (see the about page)
ai: none
license: MIT
# Today's date (YYYY-MM-DD); puts the script on the "new" page and feed. `npm run new` fills it in.
added: 2026-01-01
# Optional:
# discussion: https://...   (an existing thread anywhere)
# docs: https://...         (documentation page)
# cover: https://...        (screenshot URL; or drop a cover.png in your repo root)
---

<!--
Optional "catalog notes" go below this comment; they show above your repo's README on the script page.
Your README is the documentation, so keep notes short: "needs crow v4", "best with a 128 grid", a known issue.
Leave this empty if there's nothing to add. (This comment is not published.)
-->
