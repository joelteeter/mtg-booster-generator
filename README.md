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
* Option to download all packs concatenated into a single CSV, in pack order (handy for anything other than MTGProxyPrinter, which will group the duplicates and lose the pack boundaries)
* Output will be in scryfall csv format (finish column is `nonfoil`, `foil` or `etched`)

## Files
* `index.html` – UI, Scryfall fetching, CSV export
* `booster-logic.js` – pack layouts and odds (shared by the generator and the explanation panel)

Run this on a local server as scryfall will fail on CORS, e.g. `python3 -m http.server 8777`
