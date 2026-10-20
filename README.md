# mtg-booster-generator
Generate Magic: The Gathering booster packs from Scryfall data, then print them as proxies for a draft or sealed night, with every pack kept in order.

Lots of vibing here. The goal is to proxy cards for drafts: generate packs that follow real booster odds (or deliberately fun ones), then print them, with each pack's cards kept together and a separator land between packs.

## Running it
Two ways, both working the same:
* **Single file:** open `dist/mtg-booster-generator.html` in a modern browser (Firefox, Chrome, Safari or Edge). Everything is inside that one file, so you can copy, email or share it on its own
* **From source:** open `index.html` in the project folder (it loads `css/` and `js/` from next to it)

No install, build step or local server is needed to use either: the app talks to the Scryfall API directly, which accepts requests from a page opened from disk.

You need an internet connection for:
* **Scryfall's API** – card and set data. Requests are spaced ~150 ms apart (Scryfall asks for ≤10 per second); if Scryfall answers "429 Too Many Requests", the app waits the time Scryfall asks for and retries, showing a message while it waits
* **Scryfall's image server** (cards.scryfall.io, backs.scryfall.io) – card images for the preview, the PDFs and the simulators. It isn't rate-limited
* **jsDelivr** – the PDF library (pdf-lib) and the SQLite library (sql.js), loaded the first time you download a PDF or MTGProxyPrinter file; and, only if you use AI-enhance, TensorFlow.js, UpscalerJS and its ESRGAN model (~3 MB)

Serving the folder over HTTP (e.g. `python3 -m http.server 8777`) still works, but isn't required.

## Tabs
* **Booster Pack** – 14-card Booster Packs (Play Boosters renamed, see below) from any expansion, core, masters or draft-innovation set
* **Commander Draft Booster** – 20-card draft boosters from the official Commander booster sets:
  * Commander Legends (CMR): 13 commons (the Prismatic Piper replaces one in 1 of 6 packs), 3 uncommons, 2 legends (uncommon/rare/mythic weighted 4:2:1 per card), 1 rare/mythic, 1 foil (a foil-etched legend in 1 of 15)
  * Battle for Baldur's Gate (CLB): 13 commons, 3 uncommons, 1 legend (rare/mythic 31%), 1 Background (rare 1 in 12), 1 rare/mythic, 1 foil
  * Commander Masters (CMM): 11 commons (Piper 1 in 6), 3 uncommons, 2 legendary uncommons, 1 legendary rare/mythic, 1 rare/mythic, 1 uncommon-or-rare (rare 1 in 3), 1 foil
  * **Any set, built as a Commander booster** – pick any set (e.g. LTR, The Lord of the Rings) and one of the three layouts above. The set's legendary creatures/planeswalkers fill the legendary slots; slots it can't fill (no Backgrounds, no Prismatic Piper, too few legends) fall back to the next closest pool, and the slot table shows which
* **Planechase Simulator** – shuffles every Plane and Phenomenon on Scryfall (~200 cards) into a planar deck. Planeswalk draws the next plane and puts the one you left on the bottom; phenomena remind you to planeswalk again. Roll the planar die (1 planeswalk face, 1 chaos face, 4 blank) with a per-turn roll counter showing the extra mana cost; "New turn" resets it. Option to leave phenomena out
* **Archenemy Simulator** – shuffles every Scheme on Scryfall (~100 cards) into a scheme deck. Setting a scheme in motion reveals the next one; non-ongoing schemes go to the bottom, ongoing schemes stay in play until you abandon them. Click an ongoing scheme (or any previously revealed card in either simulator) to see it full size
* Each simulator loads its cards with one Scryfall search the first time you open its tab

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
Each tab remembers its own options, so settings chosen for Booster Packs never carry over to Commander boosters (and vice versa). The slot panel highlights every slot that differs from vanilla, shows the before → after for each change, names the option responsible, and lists which slots each option affects.

| Option | Booster Pack | Commander |
|---|---|---|
| Vanilla mode | yes | yes |
| Slot upgrades | slots 7 and 10, always on in fun mode | – |
| Fun multiplier | slots 7, 11, 13, 14 | legendary, rare/mythic, uncommon-or-rare and foil slots |
| Guest List swap | every pack slot | every pack slot |
| Foil second wildcard | slot 14 | – |
| The List in slot 7 | slot 7 | – |
| Land upgrade (non-basic land) | slot 12, always on in fun mode | – |
| Bonus land | after the pack | after the pack |

* **Fun options** (not vanilla):
  * Slot upgrades – the seventh common (slot 7) becomes an uncommon, and the third guaranteed uncommon (slot 10) becomes a guaranteed rare. Both apply at every multiplier, so a fun pack always holds one more rare than a real one
  * Fun multiplier (x1–x5) – raises upgrade odds (mythics, Special Guests, legendary rares, etc.); it removes commons from the Commander foil slot, and on Booster Packs it weights the wildcard slots towards rares and mythics
  * Wildcards start from every card name being equally likely at x1, so rares and mythics already turn up far more often than in real packs; each step of the multiplier weights rares and mythics up by that factor and commons down by it, so the dial keeps moving all the way to x5
  * The land slot (12) becomes a random non-basic land from the set (Booster Pack)
  * Make the second wildcard foil (Booster Pack)
  * Add The List to slot 7 (Booster Pack)
  * Guest List swap – a card that has a Special Guests printing swaps to it 50% of the time
* **Bonus land / pack separator** – an extra land after each pack (not part of the pack, so it's also available in vanilla mode). Choose the type: classic (original duals + fetch lands), shock, slow, scry, surveil, verge, gain, fast, guildgates, desert pingers, creature lands, fetch, original duals, check, pain, filter, bounce, bond, battle, horizon, triomes, pathways, or a different random cycle each pack

## Preview
After generating, **Preview packs** shows one pack at a time as card images, with each card's slot, rarity and a FOIL / ETCHED marker; double-faced cards flip on click. Images come from links already in the Scryfall card data, so previewing makes no extra API requests. Packs containing double-faced cards are flagged (⟲ with a count; hover for the card names) in the downloads table, the preview's pack list and the "generated" message.

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

## Files
```
index.html               page markup; loads the icon, styles and scripts below
favicon.svg              skull-and-crossbones icon (original art, mana-symbol styling)
favicon.ico              the same icon at 16-256 px, for /favicon.ico requests
css/styles.css           all styles
js/booster-logic.js      pack layouts and odds, shared by the generator and the slot panel
js/state.js              shared state: DOM shortcuts, current tab, per-tab options, pool caches
js/scryfall.js           Scryfall requests (queue + retries), card pools, Special Guests, separator lands
js/csv.js                CSV rows in Scryfall's format
js/ui.js                 form state, per-tab controls and the "How each card slot is determined" panel
js/generate.js           pack generation and the Generate button
js/downloads.js          downloads table (CSV / PDF fronts / PDF backs / MTGProxyPrinter), card back picker, AI-enhance comparison
js/preview.js            pack preview
js/simulators.js         Planechase and Archenemy simulators
js/export.js             PDF builder (incl. optional AI 2× upscaling) and MTGProxyPrinter file builder
js/main.js               start-up: fills the set lists and wires up the tabs (loaded last)
build.py                 bundles everything into dist/mtg-booster-generator.html
                         (the SVG icon is inlined too, so the single file still has one)
dist/                    the single-file build
```
The scripts are plain browser scripts that share one global scope, so the order of the `<script>` tags in `index.html` matters: `booster-logic.js` and `state.js` first, `main.js` last.

## Development
Edit the files under `css/` and `js/` (and `index.html` for markup), test by opening `index.html`, then rebuild the single file:
```
python3 build.py
```
It needs only Python 3 (no packages), inlines every local stylesheet and script into `dist/mtg-booster-generator.html`, and leaves the on-demand CDN libraries as links. Commit the rebuilt `dist/` file along with your changes so the shareable version stays current.

## Deploying
The site is hosted on Netlify, which builds it straight from this repo. There is no build step: `netlify.toml` publishes the repo root as-is.

| Branch | URL | Who can see it | Cost |
|---|---|---|---|
| `main` | [mtg-draft-generator.netlify.app](https://mtg-draft-generator.netlify.app) | public | **15 credits per deploy** |
| `dev` | dev--mtg-draft-generator.netlify.app | Netlify sign-in only | free |

Netlify's credit plans charge [15 credits for every successful production deploy](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) and nothing at all for branch deploys or deploy previews, however long the build takes. The free plan gets 300 credits a month, so **`main` is worth about 20 pushes a month and `dev` is unlimited**. Work on `dev`:

```
git checkout dev
# ...commits...
git push                      # free branch deploy, private
```

and release by merging, which is the one step that costs credits:

```
git checkout main && git merge dev && git push && git checkout dev
```

A few things worth knowing:
* running out of credits does not just block deploys — Netlify pauses the project and visitors get a "Site not available" page, so leave headroom
* failed deploys, and rolling production back to an earlier deploy, are free
* the `dev` URL is private because the project protects non-production contexts (`sso_login_context: non_production`); sign in to the Netlify account that owns the site to view it
* `[skip ci]` in a commit message stops Netlify building that commit at all, which is handy for README-only changes on `main`

## Credits
* Card data and images: [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast; this is an unofficial fan tool for play-testing proxies
* The MTGProxyPrinter save-file format (`document-v7.sql`, embedded in `js/export.js`) is from MTGProxyPrinter by Thomas Hess, GPL-3.0
* Libraries, loaded on demand from jsDelivr: [pdf-lib](https://pdf-lib.js.org) (MIT), [sql.js](https://sql.js.org) (MIT), and for AI-enhance [UpscalerJS](https://upscalerjs.com) (MIT) with [TensorFlow.js](https://www.tensorflow.org/js) (Apache-2.0)
* Pack layouts and odds: Wizards' "Collecting" articles, StarCityGames' product guides and the booster data on [mtg.wtf](https://mtg.wtf)
* Licensed under the GPL-3.0 (see `LICENSE`)
