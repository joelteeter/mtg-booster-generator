# Moving to Next.js + TypeScript + shadcn/ui

A plan, not a decision. Nothing here is started.

## What we have now

3,272 lines across 11 plain browser scripts sharing one global scope, 182 lines of
CSS, and a 65-line Python script that inlines the lot into one shareable HTML file.

| File | Lines | What it is |
|---|---|---|
| `js/booster-logic.js` | 659 | **Pure** pack logic: slots, odds, vanilla diff, God Packs, tokens. No DOM, no network |
| `js/export.js` | 496 | PDF building (pdf-lib), MTGProxyPrinter save files (sql.js), AI upscaling (TensorFlow + UpscalerJS), canvas image work |
| `js/ui.js` | 412 | Form state and the slot panel |
| `js/simulators.js` | 289 | Planechase and Archenemy |
| `js/scryfall.js` | 282 | API client, request queue, pools, caching |
| `js/generate.js` | 188 | Pack assembly |
| `js/downloads.js` | 171 | Download table and export wiring |
| `js/preview.js` | 104 | Pack preview and the card flip |
| `js/main.js`, `js/state.js`, `js/csv.js` | 139 | Start-up, shared state, CSV |

The single most important property: **everything runs in the browser.** Scryfall is
called from the client, PDFs are built on the client, SQLite runs on the client via
WASM, and the AI upscaler runs on the client's GPU. There is no server, and
`netlify.toml` has no build command at all.

## What Next.js changes, honestly

The app uses almost no Next.js feature. There is one page, no routing, no server
rendering worth having (the whole UI depends on live Scryfall data and browser
APIs), no API routes, no image optimization, no middleware. Vite + React would
cover the actual requirement with less machinery.

Next.js is still a reasonable choice here for one good reason: it is the stack you
use at work, and keeping one toolchain in your head is worth real money. That is a
legitimate basis for the decision — it just should not be mistaken for a technical
need. Everything below assumes Next.js and is designed to keep its costs low.

### Static export is the key decision

`output: 'export'` in `next.config.ts` turns the build into plain HTML, CSS and JS
with no server component. For this app that is not a compromise, it is the correct
target, and it matters for two reasons:

* **Credits.** Netlify charges 15 credits per production deploy whatever the build
  takes, so a slower build costs nothing extra. But a Next.js app deployed with the
  server runtime gets serverless functions, and compute (10 credits per GB-hour) and
  web requests (2 credits per 10k) *are* metered. A static export has neither, so
  hosting stays at exactly today's cost.
* **It matches reality.** There is nothing to render on a server.

The cost of static export: no API routes, no middleware, no ISR, and the default
image loader is unavailable. We use none of them.

## What we would lose

Two things the README currently advertises. Both are real, and both are your call.

1. **The single-file build.** `dist/mtg-booster-generator.html` is one file you can
   email, and `build.py` produces it by inlining every script, the stylesheet and the
   icon. Next.js emits hashed chunks; there is no equivalent. Keeping the feature
   means a second bundler pass over the exported output (something like
   `vite-plugin-singlefile` against a parallel Vite build), which is real work and a
   second toolchain. Dropping it is a genuine loss of capability.
2. **Opening `index.html` from disk.** Next's chunk loading does not survive
   `file://`. After the move the app needs a web server, even locally.

## Target layout

```
src/
  app/
    layout.tsx            root layout, fonts, theme
    page.tsx              the one page
    globals.css           tailwind entry
  components/
    ui/                   shadcn primitives (generated, not hand-written)
    booster/              SetPicker, PackOptions, SlotTable, VanillaDiff, ExpectedChips
    preview/              PackPreview, FlipCard
    downloads/            DownloadTable, PdfOptions, CardBackPicker
    simulators/           Planechase, Archenemy
  lib/
    booster/              PURE, no DOM, no network  <- port of booster-logic.js
      types.ts            Slot, Outcome, Stats, Pools, SetMeta
      play.ts  commander.ts  godpack.ts  tokens.ts  diff.ts  release.ts
    scryfall/
      client.ts           fetch + the rate-limit queue + retry on 429
      pools.ts            typed pools, caching
      types.ts            the Scryfall subset we actually touch
    export/
      pdf.ts  mtgproxies.ts  enhance.ts  images.ts  layout.ts
    csv.ts
  hooks/                  useSetPools, useGenerator, usePreview
  store/                  options + generated packs
tests/                    vitest, including old-vs-new parity
```

### State

Today `state.js` puts `mode`, `modeState`, `lastPacks` and the pool caches in one
global scope and other files mutate them directly — `lastPacks` is written by
`generate.js` and read by `preview.js` and `downloads.js`. That does not survive
modules, so it needs a real home:

* **Zustand** for options and generated packs. Small, no provider ceremony, and the
  per-tab option memory (`modeState`) maps onto it cleanly.
* **TanStack Query** for Scryfall. It already does the caching, deduping and retries
  that `poolCache` hand-rolls. The 150 ms rate-limit queue stays custom, underneath
  the fetcher.

Both are optional; Context plus `useReducer` would do. I lean to Zustand because the
options object is wide and flat and gets read from many components.

### shadcn/ui mapping

| Today | Component |
|---|---|
| Tab strip | `Tabs` |
| Set pickers with the released / not-released groups | `Select` with `SelectGroup` + `SelectLabel` |
| Option checkboxes, vanilla toggle | `Checkbox`, `Switch` |
| "How each card slot is determined" | `Collapsible` or `Accordion` |
| Slot table | `Table` |
| FOIL / ETCHED / changed-slot markers | `Badge` |
| Flip button tooltip | `Tooltip` |
| Status line, export progress | `Sonner` toasts, `Progress` |
| Download table | `Table` + `Button` |

shadcn is not a dependency — the CLI copies components into `components/ui`, so they
are ours to edit. It needs Tailwind, which replaces `css/styles.css` wholesale. At
182 lines that is a small loss and mostly a gain.

### TypeScript

The pure logic is where types pay. `Slot`, `Outcome`, `Stats` and `Pools` are already
well-defined shapes passed between the generator and the panel; writing them down
removes a whole class of mistakes we have hit by hand this month.

For Scryfall, `@scryfall/api-types` exists but is at `1.0.0-alpha.4`. I would rather
hand-write the subset we touch — perhaps thirty fields of `Card` and `Set` — than
take an alpha dependency on the one external shape the whole app depends on.

## Tests

We have none, and we have verified every change this month by hand in a browser. The
pure logic deserves better and is trivially testable:

* vanilla compared with itself reports zero changes, for Play and all three Commander layouts
* the mythic share follows the set's own pools and scales with the multiplier
* fun mode lays slots out in the real pack order
* token sheets cover every token in a set exactly once, with every slot backed
* a God Pack is 14 rares/mythics with exactly 2 foils and 4 Booster Fun

These double as the migration's safety net: run the old JS and the new TS over the
same inputs and diff the specs. If they agree on every set and option combination we
care about, the port is correct. That is a far stronger guarantee than clicking
through the UI, and it is only possible because the logic is pure.

## Phases

Each phase ends somewhere reviewable. Nothing is thrown away until the last one.

| # | Phase | Notes |
|---|---|---|
| 0 | Decisions below, then scaffold: Next.js + TS + Tailwind + shadcn, static export, Netlify config | Half a session |
| 1 | Port `booster-logic.js` to `lib/booster/*.ts` with types, **plus the parity test harness** | The highest-value, lowest-risk piece. Pure in, pure out |
| 2 | Scryfall client and pools, typed, with the queue and retry behaviour kept | |
| 3 | UI shell: tabs, set picker, options, slot panel, vanilla diff | The bulk of the shadcn work |
| 4 | Generate, preview (including the flip), CSV | |
| 5 | Export pipeline: PDF, MTGProxyPrinter, AI enhance | **The risky one** — see below |
| 6 | Parity sweep, then cut over and retire the old app | |

### Phase 5 is where this gets hard

`export.js` is 496 lines of browser-specific work and the only part with no clean
seam:

* **pdf-lib** is fine as an npm dependency with a dynamic import.
* **sql.js** ships a WASM file. Today it loads from jsDelivr; under a bundler its
  `locateFile` has to point at a copy we serve ourselves. Fiddly but well-trodden.
* **UpscalerJS + TensorFlow.js** are large and currently loaded on demand from a CDN
  only when someone ticks AI-enhance. They must stay dynamically imported or they
  will dominate the bundle. Keeping them as CDN script loads is also defensible.
* The canvas bleed-and-corner work is plain DOM and ports directly, but is entirely
  untested today, so regressions here are invisible until someone prints a page.

## Branch and deploys

Build it on a `next` branch. Netlify branch deploys are free, so it gets its own URL
at `next--mtg-draft-generator.netlify.app` and can be compared against `dev` side by
side for as long as it takes. Nothing touches `main` until phase 6, so the live site
stays on the current app throughout and no credits are spent.

## Rough size

3,272 lines of JS and CSS become perhaps 4,000+ of TS and TSX, plus tests, plus
config. This is several sessions of work, not one. Phases 1 and 2 are
straightforward and satisfying; phase 5 is the one that will take the longest and
has the least safety net.

## Open decisions

1. **The single-file build** — keep it (a second bundler pass), or drop it and accept
   that the shareable artifact goes away?
2. **Tests** — add Vitest as part of phase 1? I would; it is what makes the port
   verifiable rather than hopeful.
3. **In place or side by side** — keep the current app under `legacy/` until parity,
   or move straight over on the branch and rely on `dev` for comparison?
4. **State libraries** — Zustand and TanStack Query, or keep it to React built-ins?
