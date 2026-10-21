---
# Must match this folder's name and the folder the script installs into on norns (usually the repo name).
name: my-script
# Public repository with the main .lua script at its root.
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
# Optional:
# discussion: https://...   (an existing thread anywhere)
# docs: https://...         (documentation page)
# cover: https://...        (screenshot URL; or drop a cover.png in your repo root)
---

Describe the script here: what it is, how to play it, the controls (E1/E2/E3, K2/K3, grid layout), and anything people should know.

You can add screenshots by placing images next to this file and linking them like `![screen](screen.png)`.
