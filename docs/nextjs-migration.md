# Moving to Next.js + TypeScript + shadcn/ui

Phases 0 to 3 are done and live on the `next` branch. Phase 4 is next.

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

## What we lose

Two things the README currently advertises, both accepted as costs (see Decisions).

1. **The single-file build.** `dist/mtg-booster-generator.html` is one file you can
   email, and `build.py` produces it by inlining every script, the stylesheet and the
   icon. Next.js emits hashed chunks; there is no equivalent, and we have decided not
   to maintain a second bundler to keep one. This is a genuine loss of capability,
   not a wash — worth saying plainly before it disappears.
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
| 0 | Decisions below, then scaffold: Next.js + TS + Tailwind + shadcn, static export, Netlify config | **Done** (30 Oct 2026) |
| 1 | Port `booster-logic.js` to `lib/booster/*.ts` with types, **plus the parity test harness** | **Done** (30 Oct 2026). 1,925 tests, zero differences |
| 2 | Scryfall client and pools, typed, with the queue and retry behaviour kept | **Done** (31 Oct 2026) |
| 3 | UI shell: tabs, set picker, options, slot panel, vanilla diff | **Done** (31 Oct 2026) |
| 4 | Generate, preview (including the flip), CSV, **plus the two simulators** | **Done** (31 Oct 2026). 2,036 tests; the generator is compared card for card |
| 5 | Export pipeline: PDF, MTGProxyPrinter, AI enhance | **Done** (31 Oct 2026). 2,200 tests; the PDFs and the save file come out byte-identical |
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

## Decisions (settled 30 October 2026)

1. **The single-file build is dropped.** No second bundler pass. `build.py`,
   `dist/mtg-booster-generator.html` and the README's "copy, email or share it on its
   own" all go at phase 6. Opening `index.html` from disk goes with them: after the
   move the app needs a web server, locally as well.
2. **Vitest goes in at phase 1**, with the old-vs-new parity harness, before any UI
   work. The port is to be verifiable, not hopeful.
3. **Side by side on a `next` branch.** No `legacy/` directory: the current app stays
   on `dev` and the two are compared through free branch deploys,
   `next--mtg-draft-generator.netlify.app` against `dev--mtg-draft-generator.netlify.app`.
   `main` stays on the current app until phase 6, so nothing spends a credit.
4. **Zustand for options and packs, TanStack Query for Scryfall.** The 150 ms
   rate-limit queue stays custom underneath the fetcher; TanStack Query replaces the
   hand-rolled `poolCache` deduping and caching.

---

# Starting cold

Everything below exists because a session that has not lived through October would
otherwise have to ask, guess, or rediscover it the hard way.

## Where things are, and how to run them

* Repo: `/Users/joelteeter/develop/mtg booster generator/mtg-booster-generator`
  (note the spaces in the parent directory — quote paths in shell commands).
* Branches: `main` is production and **must not be pushed to** before 19 November
  2026 (see Credits). `dev` is the working branch and the base to cut `next` from.
* **Node is not on the default PATH.** Every shell call needs
  `export PATH="/opt/homebrew/bin:$PATH"` first, or `node` and `npm` are not found.
  Node 26.12.0, npm 11.20.0, installed via Homebrew this month.
* Rebuild the single-file copy after any change to `js/`, `css/` or `index.html`:
  `python3 build.py`. It is committed, and forgetting it makes `dist/` drift.
  (This goes away at phase 6.)
* Syntax check before trusting anything: `node --check js/<file>.js`.
* The pack logic runs under plain Node — `require('./js/booster-logic.js')` works
  because the file exports for CommonJS as well as the browser. That is how every
  odds change this month was verified, and it is what makes the parity harness easy.
* Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Verifying in a browser without being misled

Three traps cost real time this month. All three make correct code look broken.

1. **`python3 -m http.server` sends no `Cache-Control`.** The browser then invents
   its own freshness window and serves a stale script even through a reload and a
   hard reload. The symptom is edited code that will not take effect
   (`performance.getEntriesByType('resource')` shows `transferSize: 0`). The fix that
   works: **serve each verification run on a new port.** Netlify is not affected — it
   sends `max-age=0, must-revalidate` with an ETag.
2. **The browser pane does not advance CSS transitions or reliably paint while being
   driven.** A finished `rotateY(180deg)` reads back as 2D identity and loaded images
   render as grey boxes. Do not conclude anything is broken from this. Check the real
   state instead: set `style.transition='none'`, force a reflow, and read the computed
   transform; and check `img.complete && img.naturalWidth > 0` rather than the
   screenshot.
3. **The console panel keeps 404s from earlier page loads**, surviving navigation and
   `console.clear()`. The server's own log is the truth — `grep -c 404 <logfile>`.
   A stale favicon 404 was reported as current for several turns because of this.

Also: when writing patch scripts in Python, `re.sub` parses `\u` in the
*replacement* string, and a `"\\u2014"` in a Python literal is the six characters
`\u2014`, not an em dash. Both bit this month. Anchor on the real character, and use
a lambda replacement. Always assert the match count before writing a file.

## Facts about the domain that are not in the code

* **Tokens live in their own Scryfall set**, `t` + the set code (`tdsk`). There is no
  `set:dsk is:token`; that returns nothing.
* **Tokens must be kept distinct by collector number, not by name.** Duskmourn prints
  two different Spirits (#6, #8) and two Insects (#5, #13). Every card pool in the app
  groups by name — tokens are the one place that would silently halve the set.
* `is:token` **excludes emblems**. We deliberately include them (19 cards in `tdsk`,
  not 18): they are on the physical token sheet and worth proxying.
* `fetchPool` appends `unique:prints` and returns `[]` on a 404, so a set with no
  token set degrades rather than throwing.
* **Japan Showcase cards cannot be queried yet.** `promo:japanshowcase` returns "All
  of your terms were ignored". This blocks the 2027 wildcard-slot feature.
* **The newest released set is often not a draftable one.** On 30 October 2026 it was
  Mystery Booster Commander Edition: 1 common, 16 uncommons, 0 mythics. The set
  default therefore prefers `expansion` or `core`. Do not "simplify" that away.
* Release dates are compared as `YYYY-MM-DD` strings on purpose, so time zones never
  enter into it.

## Behaviour that is a decision, not an accident

Porting these faithfully matters; "fixing" them would be a regression.

| Behaviour | Why |
|---|---|
| Fun multiplier multiplies literally and clamps at 100% | "x3 means three times the mythics" is the intuitive promise. Odds-ratio scaling was offered and declined |
| Slot 10 in fun mode is a flat rare, never mythic | The point was rares; slot 11 already carries the mythic chance |
| The land slot is still 20% foil under the 2027 rules | Wizards' announcement is silent on the land slot and Collector Booster God Packs still list a foil land. Guessing was rejected |
| A God Pack's ten plain slots use the normal random-printing rule | So some come out Booster Fun. Forcing default frames would contradict how every other slot picks printings |
| The CSV lists both tokens of a separator | They are two different cards. Listing only the front would lose the back |
| Emblems are included with tokens | See above |
| The List era logic (`PLAY_BOOSTER_START` 2024-02-09, `LIST_ERA_END` 2024-09-27) is kept | It is a different axis from the 2027 rules and still correct for MKM–Bloomburrow sets |

The 2027 rules themselves come from Wizards' [Updating Our Boosters in
2027](https://magic.wizards.com/en/news/announcements/updating-our-boosters-in-2027)
(5 Oct 2026). The slot order and vanilla odds come from [What Are Play
Boosters?](https://magic.wizards.com/en/news/making-magic/what-are-play-boosters).
**The mtg.fandom wiki contradicts Wizards on the order of slots 11–13 — Wizards is
the one we follow.** One derived number is ours, not published: the last wildcard's
foil chance falls out as its rare + mythic chance, because Wizards never gave a rate.

## The parity harness, concretely

Run `js/booster-logic.js` and `lib/booster/*.ts` over the same inputs and diff the
specs. Both are pure, so this is a total function comparison, not a UI check.

Sweep at minimum: Play vanilla and fun at x1–x5, each with `foilToggle` and
`listToggle` on and off; all three Commander layouts, vanilla and fun; `listEra` true
and false; and `stats = null` (the set still loading). Compare slot titles, `from`,
`to`, `n`, and every outcome's `label`, `pool`, `p` and `foil`.

Golden values for DSK (81 commons, 100 uncommons, 60 rares, 20 mythics), produced
from the current code on 30 October 2026:

```
VANILLA
  1-6  Common                            Common 100.0%
    7  Common or Special Guest           Common 98.4%  Special Guest 1.6%
 8-10  Uncommon                          Uncommon 100.0%
   11  Rare or mythic                    Rare 85.7%  Mythic 14.3%
   12  Land                              Basic land 50.0%  Common dual land 50.0%
   13  Wildcard (non-foil)               Common 18.0%  Uncommon 67.0%  Rare 12.9%  Mythic 2.1%
   14  Wildcard (foil if rare or mythic) Common 54.5%  Uncommon 33.7%  Rare 10.1%  Mythic 1.7%

FUN x1
    7  Uncommon or Special Guest         Uncommon 98.5%  Special Guest 1.5%
  8-9  Uncommon                          Uncommon 100.0%
   10  Rare                              Rare 100.0%
   11  Rare or mythic                    Rare 85.7%  Mythic 14.3%     <- identical to vanilla
   12  Land (upgraded)                   Non-basic land 100.0%
   13  Wildcard                          Common 31.0%  Uncommon 38.3%  Rare 23.0%  Mythic 7.7%
   14  Wildcard (foil if rare or mythic) Common 31.0%  Uncommon 38.3%  Rare 23.0%  Mythic 7.7%

expected per pack   vanilla: Rare 1.087  Mythic 0.181  foil 0.318
expected per pack   fun x1 : Rare 2.317  Mythic 0.296  foil 0.307
```

Invariants worth asserting directly, beyond parity:

* vanilla compared with itself produces **exactly 0** changes, for Play and all three
  Commander layouts. This is the test that catches a broken diff
* fun x1 slot 11 equals vanilla slot 11 — the multiplier is neutral at x1
* the mythic share is `M / (2R + M)` scaled by the multiplier and clamped, never a
  flat constant. A set with more mythics than rares (Marvel: Darkhold Destiny, 1 rare
  and 3 mythics, gives 60%) is the case that exposed the old hardcoded 13%
* every multiplier step x1–x5 produces a **different** spec, on a normal set and on a
  lopsided one
* slot order is the real pack order in both modes: 11 rare/mythic, 12 land,
  13 wildcard, 14 foil-if-rare-or-mythic
* no foil commons or uncommons appear anywhere in a vanilla pack
* a God Pack is 14 cards, all rare or mythic, with exactly 2 foils and 4 Booster Fun
* `tokenSheets` covers every distinct token exactly once, fills every page, and backs
  every slot; `stats = null` must not throw anywhere

## Credits, in one line each

* **Netlify:** 285 of 300 used, 15 left = one production deploy. Resets 19 November
  2026. Branch deploys are free, build minutes are not metered, static export adds no
  functions — so the whole migration costs nothing as long as `main` is left alone.
  Running out **pauses the site**, it does not merely block deploys.
* **Claude:** the migration is several sessions. Phase 1 is the natural first one.

---

# Progress

## Phase 0 and 1, done 30 October 2026

On branch `next`, commits `6a21039` and `977fa04`. `main` untouched, so no
credit spent.

What is on disk now, beyond the plan's target layout:

* Next.js 16.4.3, React 19.3, Tailwind v4, Vitest 5. Tailwind v4 is wired
  through `@tailwindcss/turbopack` rather than a `postcss.config`, which is what
  create-next-app now emits — there is no postcss config file to look for.
* `@types/node` is `^24`, not create-next-app's `^20`. Vitest 5 requires it and
  will not install otherwise.
* shadcn's CLI has changed: `init` takes `-b <base>` (`base`, `radix`, `aria`)
  and `-p <preset>`, and prompts unless both are given. This project is
  `-b radix -p nova`, recorded in `components.json` as style `radix-nova`.
  Only `Button` is generated so far; the rest come with the UI in phase 3.
* shadcn 4 installs itself and a `cn` package as runtime dependencies, and
  `globals.css` imports `shadcn/tailwind.css`. That is expected, not a mistake.
* `zustand` and `@tanstack/react-query` are installed but nothing imports them
  until phases 2 and 3.
* `vitest.config.mts`, not `.ts`: Vite warns about ESM syntax in a config loaded
  as CommonJS unless the extension says so.
* eslint ignores `js/` and `dist/`. They share one global scope, so every
  function another file calls looks unused. `node --check` still covers them.
* `netlify.toml` on this branch builds to `out/`. It is a per-branch file, so
  `dev` keeps its own copy publishing the repo root with no build.

### The old app is still the live one

`js/`, `css/`, `index.html`, `build.py` and `dist/` are byte-identical to `dev`
and still run. The parity harness requires them, so they stay until phase 6.

### What the harness actually covers

`npm test` runs 1,925 assertions in three files:

* `tests/parity.test.ts` — the sweep. Both implementations over the same inputs,
  diffed field by field. Stricter than this plan asked for: as well as titles,
  `from`, `to`, `n`, `label`, `pool`, `p` and `foil`, it compares slot prose,
  `tag`, `formula` and the `boosterFun` flag, and compares probabilities exactly
  rather than approximately. Nine set fixtures, including `null`.
* `tests/invariants.test.ts` — the properties asserted directly, so they survive
  phase 6 when the old app and the parity tests go.
* `tests/golden.test.ts` — the Duskmourn table and per-pack expectations above,
  as literals.

`tests/legacy.ts` loads the old module with `createRequire`. It and
`tests/parity.test.ts` are deleted in phase 6; the other two stay.

The harness was mutation-checked: odds-ratio scaling instead of literal
multiplication, a flat 13% mythic share, the land slot losing its foil, slot 10
turning mythic, slots 12 and 13 swapped to the mtg.fandom order, one word of
slot prose, and one formula string. All seven caught.

### Behaviour the port exposed, worth knowing before phase 3

Not bugs — the pure logic's answer to a set it cannot fill. The UI will have to
render these, and the old UI's handling of them is not covered by any test:

* **A slot whose every pool is empty comes out with no outcomes at all.**
  `finalize` drops outcomes with empty pools and renormalises what is left; if
  nothing is left, the slot survives with `outcomes: []`. A set with mythics but
  no rares gets an empty fun slot 10, for instance. Slots therefore sum to 1 or
  to 0, never anything between.
* **With `stats = null`, only the pool-derived odds are null.** Fixed rates —
  1 in 64 Special Guests, half the land slots, 1 in 6 Prismatic Pipers, the
  vanilla wildcard's 18/67/15 split — are still exactly themselves while the
  set loads. `expectedCounts` counts those and skips the nulls, so a
  still-loading set has partial expectations rather than none.
* **A Commander layout given an ordinary set's `stats` empties its foil slot.**
  The foil slot reads `allC`/`allU`/`allR`/`allM`, which only
  `loadCommanderPools` builds. This is why the Commander tab has its own pool
  loader, and phase 2 must keep that split.

## Phase 2, done 31 October 2026

Commit `ce9e278`. `js/scryfall.js` becomes `src/lib/scryfall/`. 1,986 tests.

The branch deploy is live at `next--mtg-draft-generator.netlify.app`. It needed
`next` adding to the site's `allowed_branches` (it was `["main", "dev"]`);
branch deploys are free and it confirms `framework: next` with no functions and
no edge functions deployed. Non-production deploys sit behind Netlify's edge
access, so the URL asks you to sign in to the team — that is not a password and
not a misconfiguration.

### Parity needed a different trick here

`booster-logic.js` exports for CommonJS. `scryfall.js` does not: it is a plain
browser script declaring top-level `const`s and reading globals from
`state.js`. `tests/legacy-scryfall.ts` therefore runs it in a `vm` context with
`L`, `setMeta`, `poolCache`, `document` and `fetch` supplied, and appends an
expression to collect the declarations — they are in the script's lexical scope,
so code appended to the same script can see them. `document.getElementById`
returns a stub whose `textContent` setter forwards to a callback, which is how
the rate-limit notices are captured.

`tests/fake-scryfall.ts` matches queries **literally** rather than implementing
Scryfall's search language, and records anything it does not recognise. Every
parity test asserts both implementations issued exactly the same requests before
comparing the pools, so a port that asked for something subtly different fails
loudly instead of getting plausible cards back.

### Behaviour that is a decision, not an accident (phase 2)

Add these to the table above when reading this file:

* **The two loaders' `keep` differs, deliberately.** `loadPlayPools` falls back
  to the unfiltered list when `is:booster` would empty a rarity, because an
  empty rarity breaks a guaranteed slot and Scryfall's booster data is
  sometimes partial. `loadCommanderPools` does **not**: falling back there would
  readmit the precon-only cards `is:booster` exists to exclude.
* **`loadCommanderPools` awaits `getSetMeta` and discards the result.** Nine
  promises, eight destructured. It is not dead code — it warms the shared
  `setMeta` cache the set picker reads, so the Commander tab populates it too.
* **The Prismatic Piper is a Legendary Creature**, so the `legend` predicate
  counts it: it appears in `legAll` and `legC` as well as its own `piper` pool.
  A legendary slot landing on the Piper is legitimate.
* **`fetchPool` returns `[]` on a 404**, so a set with no token set degrades
  rather than throwing.
* **The 429 hold is `Retry-After + 500ms` and holds the whole queue**, not the
  one request. A dozen searches are usually already in line behind it.

### Two deliberate changes, both tested

* `rateLimitNotice` wrote straight into `#status` and `#simStatus`, which is the
  single reason none of this file could be tested before. It is an injected
  `onNotice` callback now. The clock and `fetch` are injectable for the same
  reason — no test waits out a real 10-second backoff.
* The set list sorted by subtracting `Date`s, which yields `NaN` for a set with
  no `released_at` and leaves the order unspecified. It compares the YYYY-MM-DD
  strings now, as the rest of the app already does: identical for every set that
  has a date, deterministic for those that do not.

### Where the old scryfall.js went

| Old | New |
|---|---|
| `sfFetch`, `takeTurn`, `fetchPool`, `fetchRandom` | `lib/scryfall/client.ts` |
| `loadPlayPools`, `loadCommanderPools`, `getSpg`, `getSetMeta`, `loadCycle`, `loadTokens` | `lib/scryfall/pools.ts` |
| `bonusPool` | `lib/scryfall/bonus-pool.ts` |
| `poolCache`, `cycleCache`, `tokenCache`, `ensureLoaded` | `lib/scryfall/queries.ts` (TanStack Query) |
| `initSetList`'s filtering, grouping and default pick, from `js/main.js` | `lib/scryfall/sets.ts` |
| `rateLimitNotice` | the `onNotice` callback; phase 3 routes it to a toast |
| `prepareBonus`, `prepareTokenSeparator` | **not ported** — generator concerns, phase 4 |

## Phase 3, done 31 October 2026

Commit `077202d`. The UI shell: tabs, both set pickers, the options form, the
set info line, and the slot panel with its vanilla diff. 2,012 tests.

### It had a safety net after all

The plan expected none, because the old UI is DOM strings. But much of
`js/ui.js` is value-in/value-out, so it moved to `lib/explain.ts` and
`tests/explain.test.ts` compares it against the original, loaded in a VM
(`tests/legacy-ui.ts`) exactly as `scryfall.js` was. Functions that returned
HTML return structured data now — React escapes text itself, so the old `esc`
has no counterpart — and those are compared by checking every value they carry
appears in the old markup.

What that leaves untested is markup, so the two apps were run side by side and
compared by hashing the normalised slot table, badge, chips, set info line and
vanilla-diff list:

| Configuration | Result |
|---|---|
| DSK vanilla | identical |
| DSK fun x3, foil and List toggles on | identical — hash `41624114` |
| CMM, Commander tab | identical — hash `54f9f303` |

That is the technique to reach for again in phases 4 and 5. Run the old app and
the new one at once (see below), drive both to the same state, extract the same
normalised text from each, and compare hashes rather than eyeballing.

### Running both apps at once

The session's parent directory has its own `.claude/launch.json` that serves the
old app with `python3 -m http.server 8777`. **`preview_start` resolves configs
from the session's working directory, not the repo**, so asking for a Next dev
server by name can silently hand you the old app instead — and because every
string was ported verbatim, the old app looks exactly like a working port. Check
`document.title` (the old app is "MTG Booster CSV Generator", the new one "MTG
Booster Pack Generator") or look for a `js/booster-logic.js` script tag.

A `next-dev` entry was added to that parent file, and `.claude/launch.json` in
the repo has the same for anyone whose cwd is the repo.

Two more traps worth repeating from the October list: the old panel is a
collapsed `<details>`, and `innerText` returns empty for hidden content, so set
`details.open = true` before extracting anything from it; and serve each build
on a **new port**, because `python3 -m http.server` sends no `Cache-Control`.

### Found by checking at phone width

Both real bugs, both fixed:

* A `<fieldset>` defaults to `min-width: min-content`, so the longest bonus-land
  option forced the whole form wider than the viewport. `min-w-0` on the
  fieldset.
* shadcn's `Badge` is `shrink-0` and `overflow-hidden`; the slot panel's long
  badge pushed the page sideways. It wraps now.

The page fits 375px exactly, with the slot table scrolling in its own wrapper.

### Known gaps, both deliberate

* **The simulator tabs are not ported.** `js/simulators.js` is a separate
  feature and no phase owns it; the tabs show a placeholder. It needs a home
  before phase 6 retires the old app. *(Folded into phase 4.)*
* **Dark mode never activates.** shadcn ships dark tokens but nothing sets the
  `dark` class, and the old app has no dark mode either — so this is parity, not
  a regression. Worth deciding on separately rather than slipping it into a port.
  *(Done after phase 5 — see "Dark mode, and a panel that starts closed".)*

## Phase 4, done 31 October 2026

Commit `6a8fd1e`. Generating packs, the preview with its card flip, the CSV
downloads, and the Planechase and Archenemy simulators. 2,036 tests.

The simulators were folded in here rather than left for a phase of their own:
nothing owned them, and phase 6 cannot retire the old app while a whole tab
still lives there.

### The exact comparison the plan hoped for

`tests/legacy-generate.ts` is the third and most complete of the parity tricks.
`scryfall.js`, `csv.js`, `ui.js`, `generate.js`, `preview.js` and `downloads.js`
are concatenated and run as **one** VM script — which is what the browser
effectively does, and why it works: those files share a single top-level lexical
scope (that is how `ui.js` uses `esc` from nowhere in particular), and no two of
them declare the same name. An expression appended to the end can then see every
`const` and `let` in that scope, which is how `lastPacks` — a `let` in
`preview.js` that `generate.js` reassigns — is read back out.

Underneath it: a stub DOM, a stub clock, a fake Scryfall, and `Math.random`
replaced with a seeded generator. Then the Generate handler is called. Both
implementations get the same fake and the same seed and consume randomness in
the same order, so the packs match printing for printing or the port is wrong.

`js/export.js` and `js/booster-logic.js` need none of that — both export for
CommonJS, so `require` gives the real `isDfc` and the real spec builders.

One sweep covers the pool loading, the spec, the outcome draw, the "no repeated
names in a pack" rule, the alternate-treatment preference, the Guest List swap,
God Packs, The List and its fallback, the separator lands and token separators,
the token sheets, every CSV row, the filenames, the progress messages and the
final status line. `tests/generate-summary.test.ts` adds the strings the old
code built straight into `innerHTML` — the pack names, the "All 3 packs + 1
token sheet" label, the ✨ on a God Pack and the ⟲ double-faced count — by
reading the markup back out.

### The simulators needed a different trick again

`js/simulators.js` is one IIFE, so nothing in it is in the script's lexical
scope and the appended-expression trick cannot reach it. What it does do is hand
one object out through `window.Sims`, so `tests/legacy-simulators.ts` rewrites
that single line to carry the internals with it. The rewrite is an exact string
match and **throws if it ever stops matching**, so it cannot quietly start
testing nothing.

That gives real comparison of the two configurations (three paragraphs of rules
text, which is exactly the sort of thing a port silently rewords), the planar
die, the card predicates, the shuffle, and the deck mechanics — driven as a
scripted sequence of the same calls the buttons make, comparing the deck, the
current card, the history, the ongoing schemes and the status line after every
step.

### Mutation testing

Twelve mutations against the generator and twelve against the simulators. All
caught, but four of the generator's were missed on the first pass and each one
pointed at a real gap in the scenarios:

* The Guest List swap at 60% instead of 50% was invisible because almost no
  drawn card shared a name with a Special Guest. The fixture's Special Guests
  now overlap most of the set's commons.
* Two CSV mutations were invisible because the fixture's cards had no artist,
  prices or Scryfall URI, so most of each row was empty string. They have them
  now — including a comma in the artist name, which is what the quoting is for.
* Vanilla mode no longer forcing the multiplier to 1 was invisible because the
  vanilla scenario left the multiplier at 1 anyway.

**One mutation cannot be caught, and that is worth knowing.** Removing the
`/Basic/` test — the rule that basic lands may repeat within a pack while
everything else may not — changes nothing, because `landBasics` appears in
exactly one slot of one layout, so a pack can never draw two basics. The rule is
right and is ported faithfully, but it is unobservable today and would only
start to matter if a future layout had two slots that could produce a basic.

### A flaky test, fixed

`tests/scryfall-client.test.ts` had a concurrency test that measured wall-clock
gaps between requests on the real clock. It failed about one run in ten: a
millisecond ticking over between the first call and the rest is enough to turn
40 into 39. It now freezes `now` — which is the scenario anyway, five requests
claiming their slots at the same instant — and asserts the schedule the queue
computes, while keeping real timers so the waits genuinely elapse in order.
Fifteen consecutive full runs clean.

### Behaviour that is a decision, not an accident (phase 4)

| Behaviour | Why |
|---|---|
| A pack's separator is not counted as double-faced | `dfcCount` asks whether the *card* has two faces. A token separator is two different cards sharing one printed slot, which the exporter handles separately |
| The token separator may print the same token twice | The retry is bounded at eight attempts rather than sampling without replacement, so each pack's draw stays independent |
| "Random" bonus lands skip a cycle that fails to load | One unreachable cycle should not fail a whole generation |
| `faceImages` returns `undefined` for a size a card lacks | Both implementations do. An empty `src` would hide a data problem rather than show it |
| The simulators' shuffle rejects biased values from the crypto source | `getRandomValues()[0] % n` favours low indices unless the top of the 32-bit range is discarded |

### Deliberate changes, all three small

* **The options are read once, not twice.** The old handler called `getOpts()`
  before loading and again after (`freshOpts`), because set metadata could
  arrive during the load and change `listEra`. The release date now comes from
  the set-list query, which is independent of the pools, so there is one set of
  options and it is always the later one. `tests/generate-parity.test.ts`
  asserts it equals the old `getOpts()` after a run.
* **The CSV object URL is made on click and revoked a minute later.** The old
  code built one blob per row on every render and never revoked them.
* **The preview goes back to the first pack after a run.** The old code did too
  when the panel was open, and kept a stale index when it was closed.

### Still open

**Dark mode never activates.** Unchanged from phase 3: shadcn ships the tokens,
nothing sets the `dark` class, and the old app has no dark mode either. Still a
decision to make on its own rather than inside a port. *(Done after phase 5 —
see "Dark mode, and a panel that starts closed".)*

## Phase 5, done 31 October 2026

The export pipeline: `js/export.js` and the half of `js/downloads.js` that
drives it. `src/lib/export/`:

| File | What it is |
|---|---|
| `paper.ts` | The print geometry: 63×88 mm at 300 dpi, 3×3, Letter and A4 |
| `layout.ts` | `layoutPages`, `expandFaces`, `imageUrl`, `cardBackUrl`, `placementsFor` — all pure |
| `images.ts` | The canvas work, with the geometry (`cornerPatches`, `bleedDraws`, `averageColour`) split out as arithmetic |
| `pdf.ts` | `buildPdf`, with pdf-lib and the image loader injectable |
| `save-file.ts` | `buildSaveFile`, with sql.js injectable |
| `schema-v7.ts` | MTGProxyPrinter's `document-v7.sql`, verbatim (a test asserts byte equality with the old copy) |
| `enhance.ts` | The optional GPU upscaler |
| `load-script.ts` | Loading a `window`-scoped script once |
| `run.ts` | One download button: which packs, which options, the status line, the filename |

`src/store/export.ts` holds the print settings, `src/hooks/use-export.ts`
supplies `run.ts` with the three things the old handler read out of the DOM, and
`export-options.tsx`, the three new columns in `download-table.tsx` and
`enhance-compare.tsx` are the UI.

### How it was compared

`js/export.js` exports for CommonJS, so `tests/legacy-export.ts` needs no VM:
a plain `require` gives the real functions. Both implementations then get the
same pack entries and the same three doubles:

* **`fakeImageLoader`** — deterministic bytes from the url, bleed and scale, so
  both embed identical images and a wrong url shows up as a different digest.
* **`recordingPdfLib`** — a stub pdf-lib that records every call. Comparing the
  recordings pins the geometry exactly, with no PDF timestamps or compression
  in the way. The old code reads `root.PDFLib` if it is set, which is the seam.
* **`canvasRecorder`** — stub `document`, `fetch` and `createImageBitmap`, so
  the corner-filling and bleed passes run in Node and are compared as canvas
  calls. It can also install a stub TensorFlow.js and UpscalerJS, which is the
  only way the enhanced path gets tested at all.

`tests/export-parity.test.ts` sweeps 16 option combinations over nine packs
built to hit every branch; `tests/export-run.test.ts` drives the old
`exportFile` in the phase 4 VM harness with a recording exporter and compares
the options object, the full status history, the filename and the MIME type.
The save file is compared both as rows and as bytes — one `__SQL_FOR_TESTS`
instance writes both, so the SQLite output is byte-identical.

2,200 tests, up from 2,036. **43 mutations, 43 caught**; five escaped the first
pass, all because the fixtures were too kind (an "upper-case" Scryfall id made
only of digits; a settings recorder that counted packs instead of naming their
cards; a comparison card decided by "not a land" before "not the separator"
could matter). No mutation here is unobservable, unlike phase 4's `/Basic/`
guard.

### The check that actually settles it

Rendering a page and eyeballing it was the plan's suggestion. It turned out a
byte comparison was possible: run both apps in the same browser, build the same
export from the same fourteen real Duskmourn cards, and hash the result. PDFs
differ run to run only in their timestamps, so `Date` is frozen on both sides
first.

| File | Settings | Bytes | SHA-256 |
|---|---|---|---|
| Fronts PDF | Letter, 2 mm, PNG, separate | 3,278,706 | `542545b8…` |
| Backs PDF | the same | 246,598 | `b442ad96…` |
| `.mtgproxies` | the same | 7,680 | `f66d2c11…` |
| Fronts PDF | A4, no bleed, fast, front-only, short edge, new page per pack | 2,795,093 | `31b4c499…` |
| Backs PDF | the same | 200,533 | `af38463f…` |
| `.mtgproxies` | the same | 7,680 | `f66d2c11…` |

Identical in every case, old app and port: every embedded JPEG, every cut line,
every crosshair, every clip rectangle.

> Those hashes are from commit `017cb8a`. The crop-mark change recorded at the
> end of this file deliberately changes both PDFs, so they no longer hash the
> same as the old app's — the save file is untouched, and everything in the
> PDFs except the plain black lines is still compared call for call. Also checked live: a user-supplied card
back builds a backs PDF, choosing "my own image" without a file gives the old
app's exact refusal, and the AI upscaler loads its three scripts from jsDelivr
and finishes a card in 10.1 s — the old notes measured 10–11 s.

### Dependencies

* **pdf-lib 1.17.1** is now an npm dependency, dynamically imported, so a run
  that only wants the CSV never downloads it. Same version the CDN served.
* **sql.js 1.10.3** is an npm dependency but is *not* bundled: it is an
  Emscripten build that reaches for Node's `fs` when Turbopack looks at it, and
  it fetches its own `.wasm` at runtime. `scripts/copy-sql-wasm.mjs` copies
  `sql-wasm.js` and `sql-wasm.wasm` into `public/` on install and before every
  build, and `getSql()` loads the script from this site. Both files are
  gitignored build outputs. The gain over the old app is that the one export
  that is not optional no longer depends on a third-party CDN.
* **UpscalerJS and TensorFlow.js stay on jsDelivr**, loaded only when the box
  is ticked. Bundling tens of megabytes for a feature most runs never touch
  would be the wrong trade; the plan allowed for this.

### Changes made deliberately

* **`cardBackUrl` lost its `card` parameter.** The old signature took a card and
  ignored it on purpose — the standard back, never a card's own. Keeping a
  parameter nothing reads invites someone to assume it matters.
* **The downloads table lost a redundant scroll wrapper**, left over from phase
  4: shadcn's `Table` already supplies an `overflow-x-auto` container, and
  nesting two made the inner one behave oddly at phone width.
* **Object URLs are made on click and revoked**, as in phase 4.

### Things to know

* **Row 0's status line counts token sheets as packs.** The table calls that row
  "All 3 packs + 2 token sheets", and the status line that follows says "all 5
  packs". That is the old wording, and a sheet really is another page in the
  file, so it was left alone. `exportTarget` is where it lives.
* **One branch in `placementsFor` cannot be reached through `buildPdf`.** The
  `entry.face !== 1` guard only matters if pages expanded in "separate" mode are
  placed in "front only" mode, which the app never does — but it is part of the
  function's contract, so it is compared with the modes deliberately mismatched.
* **`cardForComparison`'s "not the separator" test is likewise unreachable from
  a generated pack**, because a pack always has a non-land card before its
  separator. It is pinned by a direct test instead.
* **`public/` is now excluded from eslint**, because sql.js's own minified
  loader lives there.

## Phase 6 notes, for whoever picks it up

Everything the old app does is now ported. What is left:

* **The parity sweep and the cut-over.** This branch's `netlify.toml` already
  builds the Next app; `dev` still carries the old one that publishes the repo
  root. The cut-over is getting this branch onto `main`. Remember that only
  `main` triggers a production deploy and that production deploys cost credits
  — see "Branch and deploys" — so that is the user's call to make, not a step
  to take while tidying up.
* **Then delete** `js/`, `css/`, `index.html`, `build.py` and `dist/`, and with
  them the legacy harnesses (`tests/legacy*.ts`) and the tests that use
  them: `parity`, `golden`, `explain`, `scryfall-*`, `generate-*`, `simulators`,
  `export-parity`, `export-run`. That is most of the suite, and it is meant to
  go: it exists to prove the port, not to test the app. Decide before deleting
  which assertions are worth keeping as ordinary tests — the slot-spec golden
  files and the `lib/booster` invariants are the obvious candidates.
* **One decision is still open**: whether to keep the old app's URL working.

## Dark mode, and a panel that starts closed, 31 October 2026

Asked for after phase 5; the only place the port deliberately does more than
the old app.

**Dark mode.** `next-themes` was already a dependency and shadcn has shipped
the `.dark` tokens since phase 0 — nothing had ever put the class on `<html>`.
A `ThemeProvider` in `app/providers.tsx` does, following the system by default
and remembering an explicit choice in localStorage, and `ThemeToggle` cycles
system → light → dark so there is a way back to "follow the system" that a
sun/moon switch would not give. `<html>` carries `suppressHydrationWarning`,
because next-themes sets that class from a blocking script before the page
paints and the markup therefore differs from the prerendered HTML by design.
That script is in `out/index.html` after a build, so a static export gets no
flash of the wrong theme either.

The toggle reads the theme only after hydration (`useSyncExternalStore` with a
server snapshot of `false`, not `useEffect` — eslint rejects a `setState` in an
effect body here), so the prerendered icon and the first client render agree.

Checked both ways: every visible text node on the booster tab, the open slot
panel, the downloads table, the preview and a simulator, composited against its
real background and measured for WCAG contrast. 652 elements in light, 649 in
dark, no failures either way. Switching to "system" and flipping the OS
preference re-themes live without a reload. The handful of hardcoded colours —
the foil and etched glows, the plane and scheme card frames, the planar die,
the zoom and compare overlays — are card chrome that is meant to be dark in
both themes, exactly as the old CSS had them.

**The slot panel starts closed.** It was `defaultOpen`; the old
`<details id="howItWorks">` carries no `open` attribute, so this is a parity fix
as well as a usability one — open, it pushed the Generate button off the first
screen.

## Crop marks instead of full-page rules, 31 October 2026

Asked for after phase 5. The first place the port's *output* deliberately
differs from the old app's.

The old app drew two sets of guides for the same cuts: black rules ruled right
across the page under the cards, and inverted-colour crosshairs on top at every
card corner. The crosshairs are the better guide — they are visible on a black
border and a white one, and they mark every intersection — so the rules were
redundant and noisy. They are now four printer's brackets instead: a 5 mm arm
each way at the outside corners of whatever is actually on that page, which is
the one thing the crosshairs cannot give, because they stop at the grid.

* **The brackets follow the printed area, not the grid.** A last page with five
  cards is bracketed around two rows, not three. On a backs sheet the
  placements are mirrored, so the brackets move with them and still meet behind
  the fronts' — a one-card page is bracketed in the left column on the fronts
  and the right column on the backs.
* **No clamping.** A 5 mm arm always fits: the tightest margin this grid leaves
  is 7.6 mm, above and below the page on US Letter. That is asserted in the
  tests rather than defended against in the code.
* **The arms are still drawn under the cards**, so a large bleed covers the
  part that gets trimmed off, exactly as the rules were.

### What this does to the parity tests

`splitCutGuides` in `tests/legacy-export.ts` separates the plain black lines —
the only calls without a blend mode — from everything else. The sweep compares
the rest call for call against the old app as before, and additionally pins the
count of marks per page across all sixteen option combinations. The geometry
gets its own tests: where the arms start, how long they are, that they point
away from the cards, that they stay on the paper on both paper sizes, that they
follow a part-filled page, that they mirror with the backs, and that they are
absent when the sheet asks for no cut marks. Eleven mutations, eleven caught.

2,206 tests. The wording in the downloads note, the double-faced-card option and
`pdf.ts`'s own header was updated too, since "cut lines" no longer describes
what comes out.
