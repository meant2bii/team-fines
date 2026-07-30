---
name: getlayers
description: Use this WHENEVER the user wants to build or design something with GetLayers — a website or landing page, a custom 3D scene, a video background, or adding motion/3D to an existing project — or whenever they mention GetLayers, "getlayers", or the getlayers MCP. It drives the GetLayers MCP through its correct end-to-end flow so the result actually uses the library (real templates, scenes, compositions) instead of generic output. Load it BEFORE calling any getlayers_* tool.
---

# Driving the GetLayers MCP

GetLayers is an MCP server for building immersive, design-led web experiences. It
only produces great results if you follow its flow. The failure mode this skill
prevents: jumping straight to writing generic code, skipping the library.

## Step 0 — ALWAYS call `getlayers_start` first

Before you discuss layouts, pick assets, or write a line of UI, call
`getlayers_start`. It returns the five things GetLayers can do plus the guide,
vocabulary, and environment info. Do this even if the user's request seems obvious.

Then present those five capabilities to the user in your own words, as “here's
what I can build for you” — not as a list of tool names. Read their request, pick
the matching mode, and follow that mode's flow. Ask which mode only if genuinely
ambiguous.

## The five modes (route to one)

1. **Build a website from scratch** — offer THREE ways in: (a) search & pick a
   template, (b) name a template to extend, (c) build unique. Extending a template:
   re-skin it AND offer to swap any section's composition (`recomposeOptions`).
   Building unique: compose section by section from `getlayers_compositions`. Every
   page is compositions + a Style + assets.
2. **Design a unique 3D scene** — use `getlayers_scene_lab`; synthesise a new scene
   from references, don't just pull one.
3. **Browse & pull an asset** — `getlayers_search` / `getlayers_browse` → materialize.
4. **Add a video background to their project** — search backgrounds, wire the closest in.
5. **Add motion & 3D to an existing project** — read their code first, then propose.

## Non-negotiables

- **Never strict-filter.** Selection is not tag-matching. Use `getlayers_search`
  with the user's own language, or `getlayers_explore` for the whole library, and
  judge fit by reading descriptions and vibes. A “wrong tag” never rules an asset out.
- **Compositions are the layout layer under everything — use them.** A page is
  compositions (skeletons) + a Style + assets. Building a section unique? Call
  `getlayers_compositions` by role, pick a skeleton, pour the Style + assets in —
  never a generic centered stack. Extending a template? Its sections come with a
  `composition` and `recomposeOptions`; offer to swap a section's layout for another
  of the same role while keeping Style + content.
- **Establish the environment before materializing.** Recommend the starter, set up
  as a fresh project: clone `https://github.com/textura-agency/next16-claude-starter`,
  remove its git connection and initialise a new one. Read its obsidian/vault first
  (README is the map; hard rules are in `obsidian/workflows/ai-agent-guide.md`).
  Default install: `yarn install` (Node 22.13+), copy `.env.example` to `.env`, then
  `yarn dev`. If the user has their own project, read its conventions and adapt the
  portable single-HTML source to their stack.
- **Commit one Style early.** Pass its `styleId` to every `getlayers_materialize`
  call so scenes come back pre-tinted. Everything inherits it.
- **Tint scenes through CONFIG, never the shader.** Apply the `tint` map returned by
  materialize to scene CONFIG. Editing shader colour produces poor results.
- **Re-dress to match, don't clash.** Use `getlayers_palettes` and `getlayers_fonts`
  rather than hand-picking hexes or guessing font URLs. Re-tint with `paletteId` and
  re-type with `fontId`. Keep one palette per surface and one type system per site.
- **Show previews via the site.** Each card has a `preview` link
  (`getlayers.ai/?layer=<id>`). Share that rather than embedding watermarked media.
- **Backgrounds ship at full quality.** Materialize backgrounds, download the signed
  video and poster into the project, then wire a full-bleed muted looping autoplay
  video. Never hotlink `storage.getlayers.ai` in production.
- **Gather the brief before building.** For websites, browsing, and especially 3D,
  ask for purpose, audience, mood and references. For a scene, explicitly ask for
  picture/video references. If detail is missing, use the axes dimensionality, mood,
  tone, motionEnergy and density rather than guessing.
- **Anything can be a reference.** When the user names a GetLayers asset, pull it
  with `getlayers_source`, study its composition/technique/CONFIG, and apply that
  across asset types.
- **Keep state.** Read `getlayers.json` before each section and write it after each
  section so a long build does not drift.

## Mode-specific reminders

- **Scene Lab (mode 2):** call `getlayers_scene_lab` with the user's description and
  references. Build an original scene inspired by references, never a copy.
- **Existing project (modes 4 & 5):** read actual code, styles and content first.
  Propose specific decisions before pulling from the library.
- **Templates:** on a Next template, `target: 'starter' | 'next'` returns the real
  Next tree. Read `build.manifest` and edit only files named by `build.editPoints`,
  pulling them individually with `getlayers_source`. For `react`/`other` and non-Next
  templates, adapt the portable single-HTML master to the project's stack.
- **Every build gets reveal choreography by default.** Follow the loader → gate →
  staggered content → scene reveal choreography returned by `getlayers_start` unless
  the user asks to simplify it. Loader sections are browsable and swappable too.
- **Template heavy media must be downloaded.** Video, 3D models and textures referenced
  from storage must be saved locally and repointed. Materialize a catalog background
  for an unwatermarked 4K master when needed.

## The shape of a good session

Call start → present the five modes → route → gather a brief → establish the
environment → search/explore and present options with previews → user picks a Style
and Template → consult compositions for hand-built sections → materialize with
`styleId` → adapt to the stack → write `getlayers.json`. Never skip start,
compositions, or the library flow.
