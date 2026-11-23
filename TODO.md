# TODO

Open work for the booster generator. Newest decisions at the top of each section;
anything already settled lives in the README instead.

## Deployment

- [x] **Releases are tagged on `main`** — started 20 November 2026
  `v2.0.0` is the Next.js app with the async draft, and the first tag this
  repo has. Version 1 was the plain-scripts app, which was never numbered —
  the tag history starts where the rewrite shipped rather than pretending to
  cover what came before.

  The convention, such as it is: tag the commit that `main` actually
  published, after the deploy is `ready` rather than before, so a tag always
  names something that built. `package.json` carries the same number.

  ```
  git tag -a v2.1.0 -m "..." && git push origin v2.1.0
  ```

- [x] **Cut `main` over to the Next.js app** — done, 20 November 2026
  `main` served the plain-scripts app for the whole of the rewrite and is now
  the Next.js app, the async draft included. A clean fast-forward of 55
  commits: `main` was a strict ancestor of `dev`, so there was nothing to
  merge and nothing to conflict.

  What was checked first, since the failure mode is the account's credits
  running out and *every* site being paused:

  - the billing period had rolled over — `next_billing_period_start` is now
    19 December, so 19 November happened and the 300 are fresh
  - every recent `dev` and `next` deploy was `ready` at the exact commit being
    shipped, with the same `netlify.toml` production would use
  - the merge was a fast-forward, so what builds on `dev` is byte for byte
    what builds on `main`

  Worth correcting one thing this entry used to claim: `netlify.toml` on
  `main` was *not* already the Next.js one. It was still `publish = "."` with
  no build command. That was harmless — the merge carried the right file over
  like any other change — but the note was wrong, and a wrong note about a
  deploy is worth more than a wrong note about anything else.

  `main`'s history still holds the old app, so the rollback is a revert away.

- [ ] **Automate the monthly production deploy** — *now due*
  Credits reset on 19 Nov and the cut-over on the 20th cost one deploy, so the
  cycle is fresh and this can be set up whenever. Deliberately not done in October: the
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
  It is currently empty. Deploys work because `netlify.toml` sets the build
  and `publish = "out"` and the file wins, but nothing would cover us if the
  toml were renamed or removed.

## Frontend

- [ ] **Tell the players how the packs were made**
  A draft room knows nothing about where its pool came from. The admin picks a
  set, a fun multiplier, slot upgrades, a guest list — and then uploads a list
  of Scryfall ids, which is all the room ever sees. Somebody drafting has no
  way to tell whether they are looking at real Play Booster odds or at three
  times the mythics.

  Most of the work exists already and is in the wrong place:
  `lib/booster/diff.ts` compares a spec with the same set's vanilla spec, and
  `VanillaDiff` writes the result out in sentences on the Boosters page. What
  is missing is carrying it across the seam.

  - the pool upload would have to send a summary beside the cards — either the
    options themselves, or the sentences `describeChange` already produces.
    The sentences are less to store and cannot drift from what the admin was
    shown; the options stay re-renderable if the wording ever changes.
    Probably the sentences, with the set code and the pack count beside them
  - it belongs on the room page from the lobby onwards, not only at the end.
    Knowing the mythic rate is tripled is worth knowing *before* the first
    pick
  - "if any" is the part to get right: a vanilla draft should say so in a
    plain line rather than showing an empty panel

- [ ] **Clearing out old drafts, and an admin panel to do it**
  Nothing deletes a room. Every draft ever made is still in the blob store,
  along with every revision of it and every pick — and so is every test room,
  of which there are already a few from verifying the thing.

  Harmless for now and deliberately ignored: a room is a few kilobytes, Blobs
  storage is not metered the way compute is, and rooms cannot reach each
  other. It gets less harmless the longer it runs, and the names of people who
  played are sitting in there, which is the part that should not accumulate
  for ever without somebody deciding it should.

  What it probably wants:

  - a page listing the rooms this browser's admin keys can open, with what
    phase each is in and when it was last touched
  - delete, which means deleting a prefix: `rooms/CODE/` covers the revision
    chain, the seats and the pick log in one sweep. `Bucket` would need a
    `deleteAll(prefix)`, which Netlify Blobs can do by listing and deleting
  - an age to sweep at — a finished draft is of no use to anybody a month on,
    and nothing in the design wants it kept
  - the open question underneath it: there is no index of rooms, by design,
    because a room code is the only way in. An admin panel needs a list, and
    a list of every room on the site is the one thing the room-code scheme
    was avoiding. Probably: a per-admin index blob, written at creation, so
    the listing is "rooms you made" rather than "rooms"

- [ ] **Async draft** — *all five phases built and live, 15–20 November 2026*
  Draft digitally, print only the decks. The format wastes a pile of cards
  per player that never make a deck, and they are printed before the draft
  because the draft needs them — so inverting the order is the fix. Planned in
  [docs/async-draft.md](docs/async-draft.md).

  The decisions that shape it:

  - **a room code, not accounts.** Six characters names the room; a seat key
    in `localStorage` is what lets you pick. No users, no emails, no passwords
  - **this is the first feature that cannot be static.** Eight devices have to
    agree where each pack is while every browser is closed. Netlify Functions
    with Netlify DB for the state, Blobs for the immutable pool; the site
    stays `output: "export"`
  - **nothing polls.** The free plan's 300 credits are a hard cap that pauses
    every site on the account, and eight tabs polling for three days is four
    times the allowance. A whole draft on demand-only fetches is 3–5 credits.
    An async draft is a mailbox, so this is the right shape anyway
  - **timing cannot change what anybody sees**, because the seat order is
    fixed, so packs flow freely instead of in lockstep and a slow player only
    delays. There is a property test to write that asserts it
  - **the database holds the whole draft in one row**, because the engine's
    state is already pure JSON. `rev` is an optimistic lock so a pick is one
    `update`; a separate `shape` version catches a deploy landing mid-draft;
    an append-only pick log makes a lost draft replayable. The browser holds
    a seat key and no state at all, so there is nothing to reconcile — and
    the key rides in the URL fragment because Safari clears `localStorage`
    after seven days without a visit
  - **the printing already exists.** A submitted deck is
    `QUANTITY NAME (SET) NUMBER`, which `/proxies` reads — and every drafted
    card is a known printing, so it never touches the name fallback

  Phase 1 is the rules: `src/lib/draft/` as pure functions over opaque card
  keys, with the order-independence claim verified by breaking it on purpose.
  Phase 2 is the whole server — the storage port and room operations in
  `src/lib/room/`, the view split that gives the public board nowhere to put a
  card, the revision chain on Netlify Blobs, and one Netlify function. 85 tests
  over the two, driven against fakes that honour the same conditional writes
  the real storage does. **The key is the lock**: a draft is a chain of
  immutable blobs and a write creates the next one with `onlyIfNew`, so two
  requests computed from the same revision cannot both land.

  **Nothing to provision.** Blobs needs no connection string and no setup, so
  the draft costs nothing until somebody makes a room. It is deliberately not
  Netlify Database, which was built on first and abandoned the same day:
  that is metered by how long it stays *awake*, with a five-minute floor on
  the free plan and a 48-hour monthly ceiling, and an async draft is made of
  requests hours apart — one spread-out draft could exhaust the ceiling by
  itself. Not installing `@netlify/database` is also what stops Netlify
  provisioning a database at all.

  The move cost one new implementation of the storage port and changed nothing
  above it, which is the only evidence worth having that the port was worth
  writing.

  Phase 3 is `/draft` itself, verified in a browser against `netlify dev`: a
  room made, three players joined, packs dealt, a card taken and passed, and
  the finished state reached. A pack costs no Scryfall request — the image
  path is derived from the id the view already sends.

  Two things left to settle by experiment:

  - blobs are scoped to a site rather than a deploy context, so `next`, `dev`
    and production probably share a store. Harmless — rooms cannot touch each
    other — but untidy, and the fix is one argument to `netlifyBucket`
  - a draft cannot be reached on `main` until the cut-over, since `main` is
    still the old plain-scripts app with no functions at all

  Phase 4 is deck building: forty cards with basics counted in, five beside
  it, saved half-built as often as you like and checked only when handed in.
  `checkDeck` is the one thing that decides legality and both sides call it.

  It turned up the one real hole in the model so far: **playing and running a
  draft are separate facts, not one role.** Whoever organises a draft is
  normally in it, and a browser sends its seat key as its identity, so the
  admin key had to start travelling beside it rather than instead — otherwise
  the one person certain to need both could only ever be one.

  Phase 5 is the printing, and the arithmetic it was all for: an eight-player
  draft prints about 200 cards this way instead of 336, and every one of them
  gets played. One file a player, each starting on a fresh sheet, plus a
  decklist to copy in the format `/proxies` reads. Basics off by default —
  turning them on puts the number straight back to 336, which is the whole
  point of the switch.

  Nothing is left to build, and it is live on `main` as of 20 November. What
  is left is to **run one with real people**, which is the only test that has
  not been done: everything so far has been one browser pretending to be
  several.

  Two things to watch the first time:

  - blobs are scoped to a site rather than a deploy context, so a test room
    made on `next` or `dev` probably lands in the same store as a real draft.
    Harmless — rooms cannot touch each other — but worth confirming, and the
    fix is one argument to `netlifyBucket`
  - `DRAFT_ADMIN_PASSWORD` is unset, so anybody who finds the URL can make a
    room. Setting it in the Netlify UI turns the gate on with no deploy

  Phase 3 is the browser: the queue, the picks, the board, Check for packs.

  Blocked after that on the `main` cut-over: `main` serves the old
  plain-scripts app and has no functions.

- [x] **A Proxies page** — done, 14 November 2026
  `/proxies` takes a pasted decklist and prints those exact cards. Its own
  page rather than a tab, for the reason the simulators are: it shares nothing
  with the generator — no set, no pack count, no run — and the header is where
  pages go.

  Four decisions worth keeping:

  - **the collector number wins a disagreement with the name, and says so.**
    Set plus number names one printing and a name does not, so the number is
    what gets printed; the report names the card it actually is. Nothing is
    substituted silently, which is the whole principle of the page
  - **misses fall back one step at a time** — this printing, then this card in
    this set, then this card anywhere. A hand-edited list goes stale at the
    collector number first and the set code last, and a bare-name list
    (nothing but names, no sets) still resolves through the last step rather
    than failing against whatever set the page assumed
  - **`/cards/collection`, not a request per card.** 75 identifiers a POST, so
    a hundred-card deck is two requests. It is the only POST in the app and
    the only request that pays for a CORS preflight; one preflight per
    seventy-five cards is the trade
  - **faces are split before the pages are counted.** `expandFaces` turns a
    double-faced card into two slots inside `buildPdf`, which lets a pack
    reflow across pages. That cannot happen here: the page you choose in the
    downloads table has to be the page you saw in the preview. So the split
    happens in `lib/proxies/pages.ts` and every entry handed to the exporter
    is exactly one slot — there is a test that asserts `expandFaces` cannot
    change the page lengths

  Not built, and worth saying why: no saved lists (asked for and declined —
  nothing is remembered between visits), and no CSV or MTGProxyPrinter
  download, both of which would hand back a card list to someone who just
  pasted one.

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
