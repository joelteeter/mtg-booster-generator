# mtg-booster-generator
Generate Magic: The Gathering booster packs from Scryfall data, then print them as proxies for a draft or sealed night, with every pack kept in order.

Lots of vibing here. The goal is to proxy cards for drafts: generate packs that follow real booster odds (or deliberately fun ones), then print them, with each pack's cards kept together and a separator land between packs.

## Running it
The app is a static site: all of it runs in the browser, and there is no server
of its own. Open the deployed copy, or run it locally:
```
npm install
npm run dev
```
then open http://localhost:3000. `npm run build` writes the whole site to `out/`,
which can be served by anything that serves files.

> Until October 2026 this was plain browser scripts you could open from disk, and
> `build.py` inlined the whole app into one shareable HTML file. Both are gone:
> the rewrite to Next.js means the app is bundled, and bundled chunks do not load
> over `file://`. That is a real loss — a single file you could email was a nice
> property — and it was given up deliberately, for components, types and a test
> suite. The reasoning is in [docs/nextjs-migration.md](docs/nextjs-migration.md).

You need an internet connection for:
* **Scryfall's API** – card and set data. Requests are spaced ~150 ms apart (Scryfall asks for ≤10 per second) through one shared queue, and choosing a different set abandons the previous set's searches instead of spending the rest of them on an answer nobody will read. If Scryfall answers "429 Too Many Requests", the app waits and retries, showing a message while it waits; if it still cannot get through, the load fails rather than quietly building a pack from pools whose filters never arrived. A rate-limited 429 reaches the browser as a bare "CORS header missing" network error, because Scryfall's 429 carries no `Access-Control-Allow-Origin` — so "CORS error" in the console almost always means rate limited
* **Scryfall's image server** (cards.scryfall.io, backs.scryfall.io) – card images for the preview, the PDFs and the simulators. It isn't rate-limited
* **jsDelivr** – only if you use AI-enhance: TensorFlow.js, UpscalerJS and its ESRGAN model (~3 MB), fetched the first time you tick the box. pdf-lib is bundled, and sql.js is served from this site, so the PDFs and the MTGProxyPrinter file need no third-party CDN

## Pages
Three of them, behind a site header that carries the links, the brand and the
theme toggle: the booster builders on the front page, Planechase at
`/planechase` and Archenemy at `/archenemy`. Below `md` the links collapse
behind a menu button. The two booster builders share one page and are chosen
with the tab strip on it, since they share every control below it.

* **Booster Pack** – 14-card Booster Packs (Play Boosters renamed, see below) from any expansion, core, masters or draft-innovation set. Sets Scryfall lists but that are not out yet are grouped under “🔜 Not released yet” with their release date, since Scryfall only holds the cards spoiled so far and odds worked out from a part of a set move as more are revealed — the slot panel says so when one is chosen. The set list opens on the newest released set that is built for Limited (an expansion or core set), rather than the newest release outright, which is often a Commander or supplemental product with too few commons to build a pack from
* **Commander Draft Booster** – 20-card draft boosters from the official Commander booster sets:
  * Commander Legends (CMR): 13 commons (the Prismatic Piper replaces one in 1 of 6 packs), 3 uncommons, 2 legends (uncommon/rare/mythic weighted 4:2:1 per card), 1 rare/mythic, 1 foil (a foil-etched legend in 1 of 15)
  * Battle for Baldur's Gate (CLB): 13 commons, 3 uncommons, 1 legend (rare/mythic 31%), 1 Background (rare 1 in 12), 1 rare/mythic, 1 foil
  * Commander Masters (CMM): 11 commons (Piper 1 in 6), 3 uncommons, 2 legendary uncommons, 1 legendary rare/mythic, 1 rare/mythic, 1 uncommon-or-rare (rare 1 in 3), 1 foil
  * **Any set, built as a Commander booster** – pick any set (e.g. LTR, The Lord of the Rings) and one of the three layouts above. The set's legendary creatures/planeswalkers fill the legendary slots; slots it can't fill (no Backgrounds, no Prismatic Piper, too few legends) fall back to the next closest pool, and the slot table shows which
* **Planechase Simulator** – shuffles every Plane and Phenomenon on Scryfall (~200 cards) into a planar deck. Planeswalk draws the next plane and puts the one you left on the bottom; phenomena remind you to planeswalk again. Roll the planar die (1 planeswalk face, 1 chaos face, 4 blank) with a per-turn roll counter showing the extra mana cost; "New turn" resets it. Option to leave phenomena out
* **Archenemy Simulator** – shuffles every Scheme on Scryfall (~100 cards) into a scheme deck. Setting a scheme in motion reveals the next one; non-ongoing schemes go to the bottom, ongoing schemes stay in play until you abandon them. Click an ongoing scheme (or any previously revealed card in either simulator) to see it full size
* Each simulator loads its cards with one Scryfall search the first time you open its page, and keeps its deck for as long as the tab is open — leaving for the booster page and coming back does not reshuffle it, and does not clear a finished booster run either

## How packs are built
* **How each card slot is determined** – a collapsible panel showing every slot's card types, rarity odds, foil chance and List / Special Guest / Piper chance, with exact percentages for the chosen set, plus the expected rares, mythics, foils, lands (and legends, for Commander) per pack. It updates as options change, and the generator uses the same numbers
* **Changes from vanilla** – whenever an option moves a slot away from the official layout, the panel builds the same set's vanilla slots alongside the current ones and compares them. A summary box lists every difference (`Mythic 14.3% → 57.1% ▲`, `Common removed`, `now Rare (vanilla: Uncommon)`), each affected row is highlighted and carries a callout naming the option responsible, and the heading shows the total. Both sides are built from the same card counts, so a set's own gaps (no Backgrounds, no mythics) never show up as a change. If the chosen options happen to leave every slot at official odds, it says so instead.
* **Vanilla mode** – official odds for every slot, with the fun options switched off. For Booster Packs that means:
  * 7 commons, 3 uncommons, 1 rare or mythic (mythic share M ÷ (2R + M), each mythic printed half as often as each rare)
  * slot 7 can be a Special Guest (1 in 64 packs), or a card from The List for sets from Murders at Karlov Manor to Bloomburrow
  * a land slot: half basic land, half one of the set's common dual lands, 20% foil
  * a non-foil wildcard, then a second wildcard that is traditional foil only when it turns out to be a rare or mythic
  * an independent 1 in 1,000 chance of a God Pack instead (see below)
* **Pools follow real collation**:
  * cards Scryfall marks as not in boosters are left out, when the set has that data (e.g. Foundations' starter-kit cards; the Commander sets' precon cards)
  * a set's common dual lands appear only in the land slot, not the common slots
  * slot 7's Special Guest comes from that set's own Special Guests
  * no card name appears twice in the same pack (basic lands aside), as with collated print sheets
  * one printing of each card is chosen at random (regular, showcase, borderless…)
* Every slot sits where it does in a real pack — 6 commons, the List/Special Guest slot, 3 uncommons, rare/mythic, land, wildcard, last wildcard — in both vanilla and fun mode. Fun mode changes what fills a slot, never where it falls, so a printed pack reads in pack order and the separator land after each pack is the only land at the boundary. A fun pack therefore keeps the same 14 positions but reads 6 commons, 3 uncommons (slot 7 included), 2 rares, a land and 2 wildcards
* Sets released before Play Boosters existed (February 2024) are simulated with the current Booster Pack layout rather than their original draft or set booster; the slot panel notes this
## 2027 Booster Pack rules
Wizards' [Updating Our Boosters in 2027](https://magic.wizards.com/en/news/announcements/updating-our-boosters-in-2027) renames Play Boosters to Booster Packs and changes what is in them. Those rules are used for every set here, not only 2027 ones, since the point of this tool is to proxy packs for play rather than to reproduce the collation of older print runs.
* **Foil commons and uncommons are gone, and no pack is guaranteed a foil.** The last slot keeps the rarity odds the old foil wildcard had, but is traditional foil only when it lands on a rare or mythic. Nothing had to be invented for this: the chance of a foil in that slot is simply its rare + mythic chance (about 12% for a typical set), which is why packs with no foil at all are now the norm
* **God Packs.** Every pack has its own 1 in 1,000 chance (not one guaranteed in each 1,000) of being a God Pack, in which all 14 playable cards are rares or mythics: 10 non-foil, 2 Booster Fun, and 2 traditional foil Booster Fun. Booster Fun means a showcase, borderless, extended-art or full-art printing; if the set never printed one for the card drawn, its normal printing is used. The 10 plain slots follow the usual rule of picking any printing at random, so some of them come out Booster Fun too. The God Pack celebration card belongs to the non-playable 15th slot, which this tool has never generated, so a God Pack is still 14 cards. Generated God Packs are marked ✨ in the pack list, the preview and the status line
* **Not changed:** the land slot is still foil 20% of the time. Wizards' announcement removes foil commons and uncommons but says nothing about the land slot, and Collector Booster God Packs still list a foil land, so it was left alone rather than guessed at
* **Not implemented:** Japan Showcase cards in the wildcard slot. Scryfall has no `promo:japanshowcase` predicate to query them with yet

* Approximations, flagged in the slot panel: the vanilla non-foil wildcard's rarity split (18% / 67% / 15%) and the last wildcard's rarity weights (4 : 2 : 1 : ½) both come from Duskmourn's published sheets, the latter from when that slot was always foil

## Options
Each builder remembers its own options, so settings chosen for Booster Packs never carry over to Commander boosters (and vice versa); switching between the two clears the last run, since the packs belong to the one being left. The slot panel highlights every slot that differs from vanilla, shows the before → after for each change, names the option responsible, and lists which slots each option affects.

| Option | Booster Pack | Commander |
|---|---|---|
| Vanilla mode | yes | yes |
| Slot upgrades | slots 7 and 10, always on in fun mode | – |
| Fun multiplier | slots 7, 11, 13, 14 | legendary, rare/mythic, uncommon-or-rare and foil slots |
| Guest List swap | every pack slot | every pack slot |
| Foil second wildcard | slot 14 | – |
| The List in slot 7 | slot 7 | – |
| Land upgrade (non-basic land) | slot 12, always on in fun mode | – |
| Separator card (land or token) | after the pack | after the pack |
| Token sheets | after the packs | – |
| Full-art land sheets | after those | – |

* **Printing** – **Leave every card non-foil**, on by default, because a home printer cannot make a foil. Every slot keeps its odds and still gives you a card, so nothing in the preview or the CSV is marked FOIL or ETCHED. Two things change beyond the finish, both because they are *separate printings* rather than a finish on an ordinary card, and so would reach the PDF looking like the treatment they are:
  * **Foil-only printings are never drawn** – surge foil, galaxy foil, foil-etched, box toppers, serialized. Scryfall lists each printing's finishes, and any printing without a non-foil one is skipped; if a card has no non-foil printing at all it is still printed, since dropping the card would be worse. This applies to pack slots, separator lands and separator tokens alike. It matters most for the separator cycles, which gather every printing of a name across every set it ever appeared in — Overgrown Tomb has 20, of which 5 are foil-only
  * **Commander Legends' foil-etched legend outcome is dropped** and its 1-in-15 share goes back to the rest of that slot

  This is not a fun option — it describes the printer, not the pack — so it applies in vanilla mode too, is remembered across both booster tabs, and never shows up as a change from vanilla. With it on, the foil wildcard option below has nothing left to do and is switched off
* **Fun options** (not vanilla):
  * Slot upgrades – the seventh common (slot 7) becomes an uncommon, and the third guaranteed uncommon (slot 10) becomes a guaranteed rare. Both apply at every multiplier, so a fun pack always holds one more rare than a real one
  * Fun multiplier (x1–x5) – raises upgrade odds (mythics, Special Guests, legendary rares, etc.); it removes commons from the Commander foil slot, and on Booster Packs it weights the wildcard slots towards rares and mythics
  * Wildcards start from every card name being equally likely at x1, so rares and mythics already turn up far more often than in real packs; each step of the multiplier weights rares and mythics up by that factor and commons down by it, so the dial keeps moving all the way to x5
  * The land slot (12) becomes a random non-basic land from the set (Booster Pack)
  * Make the second wildcard foil (Booster Pack) – unavailable while cards are left non-foil
  * Add The List to slot 7 (Booster Pack)
  * Guest List swap – a card that has a Special Guests printing swaps to it 50% of the time
* **Pack separator** – an extra card after each pack (not part of the pack, so it's also available in vanilla mode). Choose **land** or **token**:
  * **Token** – one card carrying two different tokens from the chosen set, one on the front and another on the back, so those pages print double-sided. A set's tokens live in their own Scryfall set (`tdsk` for Duskmourn) along with its emblems, which are included too
  * **Land** – a random land from a cycle you pick: classic (original duals + fetch lands), shock, slow, scry, surveil, verge, gain, fast, guildgates, desert pingers, creature lands, fetch, original duals, check, pain, filter, bounce, bond, battle, horizon, triomes, pathways, or a different random cycle each pack

## Token sheets
**Also make token sheets** adds full pages after the packs holding one of every token in the set, so a draft has all of them on hand.

* tokens are ordered by collector number, and kept apart by it rather than by name — a set often prints two different tokens that share one (Duskmourn has two Spirits and two Insects)
* each card carries two tokens, one per side, so a 9-card page covers 18 of them; print the pages double-sided
* a token that is already double-faced (Duskmourn's Punchcard) keeps its own two faces and takes a card to itself
* as many pages as it takes to cover the set; slots left spare on the last page are filled with random tokens from the set rather than left blank, and so is the back of an odd last pair
* emblems are on the token sheet too and are included
* the CSV names both tokens on a card, since they are two different cards even though they share one slot; the PDFs and the MTGProxyPrinter file treat them as the two sides of one card

## Full-art land sheets
**Also make land sheets** adds pages after everything else holding one of every full-art land the set printed. Lands are the one thing packs never give you and a draft cannot be played without, and the full-art ones are the version worth printing.

* a set's full-art lands are not a separate cycle: they *are* its basics in a second treatment (`s:dsk t:land is:fullart` answers with five cards, named Plains through Forest)
* **as many pages as the full-art lands need** — Duskmourn has 5 and takes one page, Star Trek has 10 and takes two
* counted **by artwork, not by printing**: Star Trek prints its ten full-art arts at fifteen collector numbers, and printing the same image twice is wasted paper
* whatever is left of the last page is filled with the set's ordinary basic arts, so a page is not left half empty
* lands are taken **a round at a time** — one of every type, then a second of every type — so they spread across the five rather than piling up on Plains. Taking them name by name gave Duskmourn three Plains, three Islands and no second Forest
* **single-sided**, unlike the token sheets: two tokens can share a card because you only ever need the face that is up, but a land in a deck has to have a card back
* printings that exist only as a foil are left out whatever the printing option says — a surge-foil basic printed flat is the same art in the wrong frame
* a set with no full-art lands still gets one page of its ordinary basics; one with too few arts to fill a page leaves it part-full rather than repeating a card
* it costs one extra Scryfall search, and only when the option is on

## Preview
After generating, **Preview packs** shows one pack at a time as card images, with each card's slot, rarity and a FOIL / ETCHED marker. Anything with two sides — a double-faced card, or a token separator or token-sheet card carrying a different token on each side — gets a ⟲ button and turns over with a 3D flip when clicked, with the caption following to the other side's name (it says `front` or `back`, and for a token slot the name changes outright, because the back is a different card). Images come from links already in the Scryfall card data, so previewing makes no extra API requests. Packs containing double-faced cards are flagged (⟲ with a count; hover for the card names) in the downloads table, the preview's pack list and the "generated" message.

## Downloads
Every format is available for all packs together or for each pack on its own.

* **CSV** – Scryfall CSV format (finish column is `nonfoil`, `foil` or `etched`). Note: MTGProxyPrinter's CSV import merges duplicate cards, which scrambles pack order and separator lands, so use the MTGProxyPrinter file below for printing there
* **MTGProxyPrinter file (`.mtgproxies`)** – a document in [MTGProxyPrinter](https://chiselapp.com/user/luziferius/repository/MTGProxyPrinter/index)'s own save format (version 7), built in the browser with sql.js. Open it with File → Open and every card stays in pack order. It carries no layout settings, so MTGProxyPrinter uses your own (paper, margins, card bleed, cut markers)
* **PDF fronts** – US Letter or A4, 3×3 cards at 63×88 mm, laid out like MTGProxyPrinter's PDF export, built in the browser with pdf-lib:
  * card images from Scryfall's 745×1040 PNGs (300 dpi), or the faster ~270 dpi JPGs
  * cut lines across the page, under the cards
  * each card's rounded corners are filled from the pixels next to them, so small crosshairs mark every card corner on top of the cards; they invert the colour underneath, so they show on both black and white borders
  * optional **✨ AI-enhance 2×**: each card is upscaled to 1490×2080 (~600 dpi) by an ESRGAN model ([UpscalerJS](https://upscalerjs.com), MIT) running on your graphics card in the browser, for sharper text and edges. Every card face is enhanced, including the back faces of double-faced cards on the backs PDF ("front only" mode); plain card backs (standard or your own image) are never upscaled. It's slow: measured on a Mac (Apple GPU, Chrome) at about 10–11 seconds per card, so roughly 2½ minutes per 15-card pack and about 20 minutes for 8 packs. PDFs get about 4× bigger. The progress message counts the cards as they finish **Compare on one card** shows a plain 2× resize next to the AI version of a card from your packs before you commit to a whole PDF
  * optional outer bleed (1–3 mm, default 2 mm): the card's edge pixels are stretched past the outside edges of the card grid (like MTGProxyPrinter's own bleed), so borderless and full-art cards continue their art and a slightly-off cut doesn't leave a white strip
* **PDF backs** – the same pages as the fronts PDF with every position mirrored, so printing it on the reverse puts each back behind its card. Choose whether your printer flips on the long edge (left column ↔ right column) or the short edge (top row ↔ bottom row). Every normal card gets the same standard Magic card back, or your own image (picked from your computer, never uploaded). Use the same paper, bleed and "new page" settings for both PDFs
* **Double-faced cards** – choose either:
  * front and back as two separate cards (for sleeves), or
  * front only, with the back face printed behind it on the backs PDF; in this mode the fronts PDF has no cut lines or crosshairs (they print on the backs only)

  The MTGProxyPrinter file follows the same setting; the CSV lists each card once
* **Start each pack on a new page** (PDFs and MTGProxyPrinter file)

## Duplex alignment
No printer puts the second side exactly behind the first. The error is a millimetre or two, it is consistent for a given printer and paper path, and it stays invisible until you cut — at which point every card is off-centre on one side.

* **Move backs right / up** nudge the backs sheet in millimetres, half a millimetre a press, up to 10 mm either way. They move the **backs** only: the fronts carry the cut guides you cut to, so they stay put. The whole sheet moves together — images, crosshairs and crop marks — because the point is to move the print relative to the paper, not the cards relative to their own guides
* **🎯 Alignment test print** downloads two pages to measure the error with. Print it double-sided the way you print your packs, then hold it to a light **with the fronts toward you**. Measure from a ruler's middle to the front's cross — ticks are 1 mm, long ticks 5 mm — and type that in the way you are looking at it. Cross to the right of the middle means the backs must move right, so a positive number
* **the numbers mean what you see, not what the file holds.** Held to the light, the backs show through mirrored, so one axis is reversed by the time it reaches the page — and which one depends on whether the printer flips on the long or the short edge. `backPageOffset` does that conversion, so the same reading works under either setting. Without it the sign depended on a control three fields away and the only way to find it was to print twice
* the test print bakes in the offsets you already have, so printing it again is a check rather than another guess
* it needs no packs — measuring the printer is as useful before a run as after one
* the test sheet itself is never mirrored, unlike a real backs sheet: every cell carries the same marks, and a uniform grid is its own mirror, so a cell's rulers land behind a cell's cross whichever way the paper turns over

## Files
```
src/app/                 the three pages, the providers and the global stylesheet
src/components/          the site header (with its mobile menu) and the page shell
src/components/booster/  set picker, options, slot panel, generate, downloads, preview
src/components/sim/      the Planechase and Archenemy simulators
src/components/ui/       shadcn/ui components
src/hooks/               use-spec, use-generate, use-export, use-scryfall
src/store/               options, packs and export settings (Zustand)
src/lib/booster/         pack layouts and odds, shared by the generator and the slot panel
src/lib/scryfall/        Scryfall requests (queue + retries), card pools, Special Guests, separator lands
src/lib/generate/        pack generation, separators, and the wording of a finished run
src/lib/export/          page layout, card images, the PDFs, the MTGProxyPrinter file, AI upscaling
src/lib/explain.ts       the "How each card slot is determined" panel's wording
src/lib/csv.ts           CSV rows in Scryfall's format
src/lib/preview.ts       card faces and sides for the preview
src/lib/simulators.ts    planar and scheme deck mechanics
public/favicon.svg       skull-and-crossbones icon (original art, mana-symbol styling)
src/app/favicon.ico      the same icon at 16-256 px, for /favicon.ico requests
scripts/copy-sql-wasm.mjs  copies sql.js into public/ so it is served from this site
tests/                   the test suite; tests/golden/ holds values recorded from the old app
docs/nextjs-migration.md how this got here from the plain-scripts version
```
The pure parts — `lib/booster`, `lib/explain`, `lib/csv`, `lib/preview`,
`lib/simulators`, and the layout half of `lib/export` — have no DOM and no
network in them. That is what makes them testable, and the test suite leans on
it heavily.

## Development
```
npm run dev        # dev server on :3000
npm test           # the test suite
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # static export to out/
npm start          # serve out/ — worth doing before a deploy, since the
                   # routes are extensionless there (/planechase, not
                   # /planechase.html) and only a real server shows that
```
`npm test` is worth knowing about. Most of it compares against
`tests/golden/*.txt`, which hold what the previous implementation produced for
every case the suite covers, read out of it on its last day. Those files cannot
be regenerated — the code that produced them is gone — so a failure there is
either a real regression or a change you meant to make, in which case read the
diff and update the file by hand.

## Deploying
Open work and decisions still to make are tracked in [TODO.md](TODO.md).

The site is hosted on Netlify, which builds it straight from this repo:
`netlify.toml` runs `npm run build` and publishes `out/`. Build minutes are not
metered, so the build itself is free; what costs credits is the production
deploy, below.

| Branch | URL | Who can see it | Cost |
|---|---|---|---|
| `main` | [mtg-draft-generator.netlify.app](https://mtg-draft-generator.netlify.app) | public | **15 credits per deploy** |
| `next` | next--mtg-draft-generator.netlify.app | Netlify sign-in only | free |
| `dev` | dev--mtg-draft-generator.netlify.app | Netlify sign-in only | free |

> **`main` has not been cut over yet.** It still serves the plain-scripts app.
> `dev` and `next` are the rewrite and hold the same commits; the cut-over is
> merging one of them into `main`, which costs a production deploy and so waits
> for credits. Until then `main` is itself the rollback: the old app is still
> live on it, and still in this repo's history.

Netlify's credit plans charge [15 credits for every successful production deploy](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) and nothing at all for branch deploys or deploy previews, however long the build takes. The free plan gets 300 credits a month, so **`main` is worth about 20 pushes a month and a branch is unlimited**. Work on a branch:

```
git checkout next
# ...commits...
git push                      # free branch deploy, private
```

and release by merging, which is the one step that costs credits:

```
git checkout main && git merge next && git push && git checkout next
```

A few things worth knowing:
* running out of credits does not just block deploys — Netlify pauses the project and visitors get a "Site not available" page, so leave headroom
* the balance is on the billing page, and only there. `netlify api getAccount` returns a `capabilities.credits` object, but its `used` read `0` on a day the billing page said 14 were left; it sits among concurrency counters and is not a period total
* failed deploys, and rolling production back to an earlier deploy, are free
* the branch URLs are private because the project protects non-production contexts (`sso_login_context: non_production`); sign in to the Netlify account that owns the site to view it
* `[skip ci]` (or `[skip netlify]`) anywhere in a commit message stops Netlify building that commit, which is how to land a README-only change on `main` for free. Netlify [announced it in 2018](https://www.netlify.com/blog/2018/10/08/get-more-control-over-netlify-continuous-deployment-with-deploy-skipping/) and it is not in the current docs, so check the deploy list afterwards rather than assuming; with several commits pushed together only the last one needs the token, and it does not affect deploy previews

## Credits
* Card data and images: [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast; this is an unofficial fan tool for play-testing proxies
* The MTGProxyPrinter save-file format (`document-v7.sql`, copied verbatim into `src/lib/export/schema-v7.ts`) is from MTGProxyPrinter by Thomas Hess, GPL-3.0
* [Next.js](https://nextjs.org), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com), with [TanStack Query](https://tanstack.com/query) and [Zustand](https://zustand.docs.pmnd.rs)
* [pdf-lib](https://pdf-lib.js.org) (MIT) and [sql.js](https://sql.js.org) (MIT) for the PDFs and the MTGProxyPrinter file; for AI-enhance, [UpscalerJS](https://upscalerjs.com) (MIT) with [TensorFlow.js](https://www.tensorflow.org/js) (Apache-2.0), loaded from jsDelivr only when it is used
* Pack layouts and odds: Wizards' "Collecting" articles, StarCityGames' product guides and the booster data on [mtg.wtf](https://mtg.wtf)
* Licensed under the GPL-3.0 (see `LICENSE`)
