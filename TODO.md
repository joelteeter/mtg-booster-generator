# TODO

Open work for the booster generator. Newest decisions at the top of each section;
anything already settled lives in the README instead.

## Deployment

- [ ] **Cut `main` over to the Next.js app** — *waiting on credits*
  `next` and `dev` both hold the rewrite; `main` still serves the plain-scripts
  app. The cut-over is `git checkout main && git merge dev`, which costs one
  production deploy (15 credits) and so waits for the reset: the billing period
  runs 19 October to 18 November.
  - `netlify.toml` on both branches already runs `npm run build` and publishes
    `out/`; nothing else needs changing for the cut-over
  - `main` is the rollback until it is cut over: the old app is live on it, and
    stays in this repo's history afterwards
  - **14 credits left** as of 8 November, confirmed on the billing page. A
    production deploy costs 15, so this period cannot pay for one at all —
    there is no judgement left in the wait, only arithmetic
  - read that number off the billing page, not the API: `getAccount`'s
    `capabilities.credits` reported `used: 0` on the same day, for the same
    period. It sits beside concurrency counters that are also `0` and is not a
    period total

- [ ] **Automate the monthly production deploy** — *after 19 November 2026*
  Credits reset on 19 Nov (`next_billing_period_start`), so set this up on the
  20th or later, with the cycle fresh. Deliberately not done in October: the
  free plan is a hard limit and running out pauses the project, so visitors get
  a "Site not available" page rather than just deploys being blocked. We were at
  285/300 and did not want to gamble the site being served.
  - a GitHub Actions `schedule` workflow only fires from the default branch, so
    it has to live on `main`, not `dev`
  - land it on `main` with `[skip ci]` in the commit message so installing it
    does not itself cost a production deploy
  - the job merges the working branch into `main`; Netlify then builds once
    (15 credits)
  - a cron such as `0 17 20 11 *` fires every year, so guard it on the year or
    delete it after it runs
  - it pushes to `main` unattended, shipping everything accumulated on `dev` in
    one deploy — that is the point, but it should be a deliberate choice

- [ ] **Set `build_settings.dir` to `.` in the Netlify UI**
  It is currently empty. Deploys work because `netlify.toml` sets
  `publish = "."` and the file wins, but nothing would cover us if the toml were
  renamed or removed.

## Frontend

- [x] **A rate limit no longer builds the wrong pack** — done, 10 November 2026
  `optional()` wrapped the `is:booster` and land-slot searches, so a failure
  produced no cards — and no cards is a real answer for `is:booster`, which
  plenty of sets lack. Under a rate limit it was not: the loader carried on
  with pools that had skipped their filter, and the pack came out built from
  the precon cards `is:booster` exists to remove, with nothing to say so.
  `ScryfallUnavailableError` now separates "we never got to ask" from "the
  answer was empty", and `optional` rethrows the first.

  The rate limit itself is mostly self-inflicted: choosing a set left the
  previous set's dozen searches in the queue. They now carry TanStack Query's
  `signal`, so they stop when nothing is waiting for them.

  Note a 429 from Scryfall carries no `Access-Control-Allow-Origin`, so the
  browser reports it as a CORS failure and the status is unreadable from
  JavaScript. That is why the client treats a bare network error as "slow
  down" rather than "offline".

- [x] **Move to Next.js + TypeScript + shadcn/ui** — done, 30–31 October 2026
  Planned and recorded in [docs/nextjs-migration.md](docs/nextjs-migration.md),
  carried out in six phases on the `next` branch. The old plain-scripts app,
  `build.py` and the single-file build in `dist/` are gone; what they did is
  written up in that document, including what was given up (a file you could
  email, and opening the app from disk) and why.

  That settles the CSS/UI framework question this superseded: shadcn/ui means
  React, Tailwind and a bundler, so the no-build property went with it. The
  alternative considered was a CSS-only framework (Bootstrap, Bulma, Pico.css)
  which would have kept it; the reasoning is in the migration document.

- [x] **A site header, with a menu below `md`** — done, 31 October 2026
  Sticky, with the brand, the three pages and the theme toggle; the links
  collapse behind a button on a phone. The header lists pages, so the choice
  between the two booster builders went back to being a tab strip on the page
  it belongs to — nav for where you are, tabs for what the controls mean.

  The menu is a disclosure panel rather than a slide-in drawer: for three
  links a drawer is a portal, a focus trap and a scroll lock around a list
  that already fits on the screen.

- [x] **Simulators are their own pages** — done, 31 October 2026
  `/planechase` and `/archenemy`, rather than two more values of the `mode`
  variable. They share nothing with the booster builders — no set, no options,
  no packs — so everything reading `mode` had to allow for a mode that had
  none of it. The strip across the top is navigation now; the two builders
  still share the front page, because they share every control under them.

  One behaviour changed with it: visiting a simulator no longer throws away a
  finished booster run. Switching between the two builders still does, since
  the packs belong to the one being left.

- [x] **Option: leave every card non-foil** — done, 9 November 2026
  On by default, since the app exists to print proxies and a home printer
  cannot make a foil. It is a printing preference rather than an odds change,
  so it survives vanilla mode, is shared by both booster tabs instead of
  living in `byMode`, and is applied to the slot drafts by `withoutFoils`
  before `finalizeSlots` — which keeps the panel and the generator reading one
  outcome list.

  Two things change beyond the finish, both for the same reason — they are
  separate printings rather than a finish on an ordinary card, so they would
  reach the PDF looking like the treatment they are:

  * Commander Legends' foil-etched legend outcome is dropped and its 1-in-15
    share redistributed across the rest of that slot.
  * Printings with no non-foil finish are never drawn: surge foil, galaxy
    foil, box toppers, serialized, Expeditions. `nonFoilPools` narrows every
    pool once at the top of a run, and the separator lands and tokens get the
    same treatment. The rule is Scryfall's `finishes` array rather than a list
    of promo-type names, so a treatment invented next year is covered without
    a code change. It matters most for the separator cycles, which gather
    every printing of a name across every set: Overgrown Tomb has 20 and 5 of
    them are foil-only.

  Note `-is:promo` does not catch these — the surge-foil Overgrown Tomb in
  Star Trek has `promo: false`, and `is:booster` filtering keeps it because
  pools are kept by name+rarity so that showcase and borderless treatments
  survive.

- [ ] **Dark mode is new; the old app had none**
  Added after phase 5 and following the system by default. Nothing here needs
  doing — it is noted because it is the one place the rewrite does more than
  the app it replaced, rather than the same thing differently.

- [x] **Option: full-art land sheets** — done, 10 November 2026
  Pages after the packs and token sheets holding one of every full-art land
  the set printed. Lands are the one thing packs never provide and a draft
  cannot run without.

  A set's "full-art lands" turned out not to be a separate cycle: they are its
  basics in a second treatment, so there is one pool, not two.

  Two things were wrong in the first cut, both found by running it against
  real sets rather than fixtures:

  * it filled name by name, which gave Duskmourn three Plains, three Islands
    and no second Forest. It takes a round at a time now, so the lands spread
    across the five types.
  * it was fixed at one page, so Star Trek's ten full-art lands lost one. The
    full-art count decides the page count now, and they are counted by
    artwork rather than by printing — Star Trek prints ten arts at fifteen
    collector numbers.

  Single-sided, unlike the token sheets, because a land in a deck needs a card
  back. Foil-only printings are excluded unconditionally here rather than
  following the printing option, since the sheet exists to be printed.

- [x] **Duplex alignment: offsets and a test print** — done, 12 November 2026
  Found by printing: no printer lands the back exactly behind the front, and
  the error only shows once the cards are cut. Two offsets in millimetres move
  the backs sheet to meet the fronts, and a two-page test print measures what
  to type into them.

  The offsets move the whole page — images, crosshairs and crop marks — since
  the sheet moves relative to the paper, not the cards relative to their own
  guides. They apply to the backs only, because the fronts carry the guides
  you cut to.

  The test sheet is never mirrored, unlike a real backs sheet: all nine cells
  carry the same marks, and a uniform grid is its own mirror. Its rulers went
  out unlabelled in the end — numbering both axes put the +5 of one beside the
  −5 of the other at every corner, and two 5 pt numerals a millimetre apart
  are worse than none.

  Shipped with the sign wrong, in the sense that mattered: the offsets were
  in the backs page's own coordinates, but they are read off a sheet held to
  a light with the fronts toward you, where the back shows through mirrored.
  So "+ right" moved it left, and which axis was reversed depended on the
  flip setting. `backPageOffset` converts now, and the controls say what you
  see. Worth remembering for anything else printed on a second side.

- [x] **Lands and Tokens pages** — done, 13 November 2026
  `/lands` and `/tokens`: pick any set, print every land or token it made.
  The booster page's land sheet and token sheets are for a pack run; these are
  the same pages on their own, which is a different job — no odds, no pack
  order, and any set at all rather than one a booster can be built from.

  One component for both, differing only in the search and the wording. The
  downloads go through `runExport` exactly as a pack does, so there is one
  export path rather than two.

  Over a thousand sets, so the picker is a search box. Cards are kept one per
  artwork, and promos are kept rather than excluded — a Secret Lair drop is
  nothing but promos, and it comes to 413 lands over 46 pages.

  Open: the user asked for this to reach "commander deck sets, secret lair
  drops, and that kind of thing", which it does by taking any set code. What
  it does not do is group a product that spans several set codes, if one
  turns up.

- [x] **Lands filter, and the foils the new pages were missing** — done,
  13 November 2026
  *All lands*, *Basic lands*, *Full-art basics*, each a narrowing of the one
  before: a set's full-art lands are its basics in another treatment, so it
  is one nested choice rather than two checkboxes with a meaningless fourth
  state.

  The pages also went out without the no-foil rule the booster sheets have
  had since the surge-foil fix — 28 printings of Star Trek's lands and 12 of
  Final Fantasy's tokens would have printed as foil treatments. Foils are
  dropped before the artwork is deduplicated, or an art printed both ways
  could keep the foil-only copy and lose the card entirely.

- [x] **Duplex rotation** — done, 13 November 2026
  Found by printing: a sheet that lines up at one end and is out at the other
  by about a millimetre, repeatably, on an inkjet. An offset cannot fix that
  — it moves where the error is zero without changing how fast it grows — so
  the backs page now takes a rotation as well, about the page centre.

  It is applied as one transform over the whole page rather than a rotation
  on each thing drawn, so the cards, crosshairs and crop marks swing
  together, and it is left out of the PDF entirely at zero.

  Reversed for the back page like the offsets, but unconditionally: a mirror
  in either axis turns anticlockwise into clockwise, so unlike the offsets
  the flip setting does not come into it.

  Worth remembering the diagnosis, which took three printed sheets: horizontal
  error changing *down* the page is rotation; changing *across* the page would
  be scale, which nothing corrects yet; the same everywhere is an offset.

- [x] **Settings that survive a reload** — done, 13 November 2026
  Every store was plain in memory, so a refresh reset everything — including
  a duplex calibration that takes three test sheets to find. `localStorage`
  now holds the print settings, the lands and tokens choices, and the no-foil
  preference: all three describe the printer or the standing choice rather
  than the job in hand.

  Not the custom card back, which is a blob URL and dead after a reload, and
  not the booster run's own options, which are what you were doing rather
  than how you print.

  Stored values merge *over* the defaults. Zustand's own merge is shallow and
  would swap the whole slice, so a browser holding a copy from before an
  option existed would come back missing it — and options get added here
  often enough that it is the common case.

- [x] **Fill and preview on the sheets pages** — done, 13 November 2026
  Filling the last page out to nine is off by default and seeded from the
  selection, so the preview and the PDF cannot disagree about which cards are
  on it. The preview is the booster page's own, pulled out of `PackPreview`
  into a presentational component both use; which page is open stays with the
  caller, since the booster page keeps it in a store that "Compare on one
  card" reads.

## Pack simulation

- [ ] **Japan Showcase cards in the wildcard slot** (2027 rules)
  Wizards' 2027 announcement puts them in the wildcard slot in traditional foil.
  Not implemented because there is no Scryfall predicate for them yet —
  `promo:japanshowcase` returns "All of your terms were ignored". Needs a
  working query before it can be built; it would then hang off `processCard` in
  `generate.js`, like the Guest List swap, since it is a printing swap rather
  than a slot change.

- [ ] **Revisit the 2027 odds when "Collecting Nauctis" publishes** (~Jan 2027)
  Nauctis releases 2027-02-05 and has no cards on Scryfall yet. The published
  set article should give the real numbers for the foil slot and the Japan
  Showcase rate, which are currently derived rather than official.

- [ ] **Optional: "even wildcard odds" toggle**
  Fun mode replaces both wildcard sheets with even-by-card-name picking whatever
  the multiplier is, so fun x1 still differs from vanilla in slots 13 and 14. A
  toggle (on by default) would let the other fun options be used without that,
  and make x1 genuinely match vanilla.

- [ ] **Optional: odds-ratio scaling instead of the hard clamp**
  `p' = m·p / (1 + (m−1)·p)` never saturates, so a set whose base mythic share is
  already high keeps responding past x2. We kept the literal multiplier on
  purpose — "x3" meaning three times the mythics is the more intuitive promise,
  and the slot 10 guaranteed rare now covers the case that prompted this. Only
  worth revisiting if the clamp shows up on a real, fully spoiled set.

- [ ] **Optional: let slot 10 roll rare-or-mythic**
  It is a flat rare today, chosen deliberately because the goal was rares and
  slot 11 already carries the mythic chance.

- [ ] **Open question: should the land slot still be 20% foil?**
  The 2027 rules remove foil commons and uncommons, and basic lands are common
  rarity, so arguably foil lands go too. Wizards' announcement says nothing
  about the land slot and Collector Booster God Packs still list a foil land, so
  it was left alone rather than guessed at. It is now the larger share of the
  remaining foils (0.2 of about 0.32 per pack).

- [ ] **Optional: God Pack "Booster Fun" fidelity**
  The two Booster Fun slots and two foil Booster Fun slots prefer an alternate
  treatment, but the other ten use the normal random-printing rule, so some of
  them come out Booster Fun too. Wizards lists those ten as plain, which would
  mean forcing a default-frame printing — at odds with how every other slot in
  this app picks printings.

## Housekeeping

- [ ] **The golden files cannot be regenerated**
  `tests/golden/*.txt` hold what the old implementation produced for every case
  the suite covers, read out of it on its last day. When the odds change on
  purpose — the 2027 revisit above will — the tests will fail, and the right
  response is to read the diff and update the file by hand rather than to
  re-record, which is no longer possible.

  Done once so far, and `tests/golden/generate.txt` logs it in its own header:
  the non-foil option added `opts.noFoils = false` to nine recorded options
  dumps. That value is the recorded behaviour, so no pack, file or status line
  moved — which is exactly what to check before accepting a golden diff.
