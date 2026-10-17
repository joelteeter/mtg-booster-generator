# mtg-booster-generator
Generate booster packs from Magic the Gathering sets, following Play Booster and Commander draft booster odds

Lots of vibing here, the goal was to be able to proxy cards for a draft or sealed setting.  For easy importing into https://chiselapp.com/user/luziferius/repository/MTGProxyPrinter/index I output packs into separate csv files as MTGProxyPrinter will group duplicates and I need packs to be strictly as they are generated.

## Tabs
* **Play Booster** – 14-card Play Boosters from any expansion, core, masters or draft-innovation set
* **Commander Draft Booster** – 20-card draft boosters from the official Commander booster sets:
  * Commander Legends (CMR): 13 commons (Prismatic Piper replaces one in 1 of 6 packs), 3 uncommons, 2 legends (uncommon/rare/mythic weighted 4:2:1 per card), 1 rare/mythic, 1 foil (foil-etched legend in 1 of 15)
  * Battle for Baldur's Gate (CLB): 13 commons, 3 uncommons, 1 legend (rare/mythic 31%), 1 Background (rare 1 in 12), 1 rare/mythic, 1 foil
  * Commander Masters (CMM): 11 commons (Piper 1 in 6), 3 uncommons, 2 legendary uncommons, 1 legendary rare/mythic, 1 rare/mythic, 1 uncommon-or-rare (rare 1 in 3), 1 foil
  * Commander set codes also contain their precon deck cards, so pools are limited to cards Scryfall marks `is:booster`
  * **Any set, built as a Commander booster** – pick any set (e.g. LTR, The Lord of the Rings) and one of the three layouts above. The set's legendary creatures/planeswalkers fill the legendary slots; slots it can't fill (no Backgrounds, no Prismatic Piper, too few legends) fall back to the next closest pool, and the slot table shows which
* **Planechase Simulator** – shuffles every Plane and Phenomenon on Scryfall (`layout:planar`, ~200 cards) into a planar deck. Planeswalk draws the next plane and puts the one you left on the bottom; phenomena remind you to planeswalk again. Roll the planar die (1 planeswalk face, 1 chaos face, 4 blank) with a per-turn roll counter showing the extra mana cost; "New turn" resets it. Option to leave phenomena out
* **Archenemy Simulator** – shuffles every Scheme on Scryfall (`layout:scheme`, ~100 cards) into a scheme deck. Setting a scheme in motion reveals the next one; non-ongoing schemes go to the bottom, ongoing schemes stay in play until you abandon them
* Each simulator loads its cards with one Scryfall search the first time you open its tab, then shows images from Scryfall's image server one card at a time

## Options
Each tab remembers its own options, so settings chosen for Play Boosters never carry over to Commander boosters (and vice versa). The slot table tags every slot a fun option changes, and lists which slots each option affects.

| Option | Play Booster | Commander |
|---|---|---|
| Vanilla mode | yes | yes |
| Fun multiplier | slots 7, 11, 12, 13 | legendary, rare/mythic, uncommon-or-rare and foil slots |
| Guest List swap | every pack slot | every pack slot |
| Foil second wildcard | slot 13 | – |
| The List in slot 7 | slot 7 | – |
| Land upgrade (non-basic land) | slot 14, always on in fun mode | – |
| Bonus land | after the pack | after the pack |

* **Vanilla mode** – official odds for every slot, fun options switched off. For Play Boosters that means a real basic/common land slot (20% foil), a non-foil wildcard, a traditional-foil wildcard, mythic share of M ÷ (2R + M), Special Guests in 1 of 64 packs, and The List in slot 7 for MKM–Bloomburrow era sets
* **How each card slot is determined** – collapsible panel showing every slot's card types, rarity odds, foil chance and List / Special Guest / Piper chance, with exact percentages for the chosen set. It updates as options change, and the generator uses the same numbers
* Fun options (non-vanilla):
  * Fun Booster Multiplier increases upgrade odds (mythics, Special Guests, legendary rares, etc.) and removes commons from wildcard/foil slots
  * Replaced the basic land with a random non-basic land from the set (Play Booster)
  * Option to make the second wildcard foil (Play Booster)
  * Option to add The List to slot 7 (Play Booster)
  * Option to evenly swap for a Guest List card if it exists in the set
* Option to separate boosters with a bonus land, and pick the land type: classic original duals + fetches, shock, slow, scry, surveil, verge, gain, fast, guildgates, desert pingers, creature lands, fetch, original duals, check, pain, filter, bounce, bond, battle, horizon, triomes, pathways, or a random cycle each pack
* Will grab a random version of each card if multiple versions exist in scryfall
* **Preview packs** (proof of concept) – after generating, view each pack as card images with its slot, rarity and foil/etched marker; double-faced cards flip on click. Images come from the links already in the Scryfall card data and load from Scryfall's image server (cards.scryfall.io) one pack at a time, so previewing makes no extra API requests
* **Downloads** – for all packs together, or each pack on its own, in three formats:
  * **CSV** – Scryfall CSV format (finish column is `nonfoil`, `foil` or `etched`). MTGProxyPrinter's CSV import merges duplicate cards, so pack order and separator lands get lost there
  * **PDF** – built in the browser with pdf-lib: US Letter or A4, 3×3 cards at 63×88 mm (Scryfall's 745×1040 PNGs at 300 dpi, or the faster ~270 dpi JPGs), with cut lines across the page like MTGProxyPrinter's export. Upgrades: each rounded corner is filled from the pixels next to it, and an optional outer bleed (1–3 mm) stretches the card's edge pixels past the outside edges of the card grid (like MTGProxyPrinter's bleed), so borderless and full-art cards continue their art and a slightly-off cut doesn't leave a white strip. Because the corners are filled, small crosshairs mark every card corner on top of the cards; they invert the colour underneath, so they show on both black and white borders
  * **MTGProxyPrinter save file (`.mtgproxies`)** – built in the browser with sql.js in MTGProxyPrinter's own document format (v7), so File → Open keeps every card in pack order. The file carries no layout settings, so MTGProxyPrinter uses your own defaults
  * **PDF backs** – the same pages as the fronts PDF with every position mirrored, so printing it on the reverse puts each back behind its card. Choose whether your printer flips on the long edge (left column ↔ right column) or the short edge (top row ↔ bottom row). Every normal card gets the same standard Magic card back (never special backs like the 30th Anniversary Edition one), or your own image (picked from your computer, never uploaded)
  * **Double-faced cards** – either the front and back as two separate cards (for sleeves), or front only with the back face printed behind it on the backs PDF (in that mode the fronts PDF has no cut lines; they print on the backs only). The MTGProxyPrinter file follows the same setting; the CSV lists each card once
  * Option to start each pack on a new page (PDFs and save file)
  * Packs that contain double-faced cards are flagged (⟲ with a count, hover for the card names) in the downloads table, the preview's pack list and the "generated" message

## Files
* `index.html` – UI, Scryfall fetching, CSV export
* `booster-logic.js` – pack layouts and odds (shared by the generator and the explanation panel)
* `simulators.js` – Planechase and Archenemy simulators
* `export.js` – fronts/backs PDF and MTGProxyPrinter save-file export (loads pdf-lib and sql.js from jsDelivr the first time you use them)

Run this on a local server as scryfall will fail on CORS, e.g. `python3 -m http.server 8777`
