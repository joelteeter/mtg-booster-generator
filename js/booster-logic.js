/*
 * booster-logic.js
 * ----------------
 * Pure pack-structure logic shared by the generator and the "How each slot is
 * determined" panel. Every slot is described as a list of possible outcomes
 * (pool + probability + finish). The generator samples from exactly the same
 * outcome lists the panel displays, so the explanation can never drift from
 * what actually happens.
 *
 * No DOM or network code lives here.
 */
(function (root) {
    "use strict";

    // ---------------------------------------------------------------------
    // Commander draft-booster sets supported by the Commander tab
    // ---------------------------------------------------------------------
    const COMMANDER_SETS = {
        cmr: { code: "cmr", name: "Commander Legends", released: "2020-11-20" },
        clb: { code: "clb", name: "Commander Legends: Battle for Baldur's Gate", released: "2022-06-10" },
        cmm: { code: "cmm", name: "Commander Masters", released: "2023-08-04" }
    };

    // Play Boosters launched with Murders at Karlov Manor. From MKM through
    // Bloomburrow, slot 7 could hold a card from The List; from Duskmourn on,
    // it is only a common or (1 in 64) a Special Guest.
    const PLAY_BOOSTER_START = "2024-02-09";
    const LIST_ERA_END = "2024-09-27";

    // ---------------------------------------------------------------------
    // Bonus / separator land cycles (dropdown)
    // Cycle names follow managathering.com where it has them.
    // ---------------------------------------------------------------------
    const LAND_CYCLES = [
        { id: "classic", label: "Classic: original duals + fetch lands (built-in printings)", builtIn: true },
        { id: "shock", label: "Shock lands", names: ["Hallowed Fountain", "Watery Grave", "Blood Crypt", "Stomping Ground", "Temple Garden", "Godless Shrine", "Overgrown Tomb", "Breeding Pool", "Steam Vents", "Sacred Foundry"] },
        { id: "slow", label: "Slow lands", names: ["Deserted Beach", "Shipwreck Marsh", "Haunted Ridge", "Rockfall Vale", "Overgrown Farmland", "Shattered Sanctum", "Deathcap Glade", "Dreamroot Cascade", "Stormcarved Coast", "Sundown Pass"] },
        { id: "scry", label: "Scry lands (Temples)", names: ["Temple of Enlightenment", "Temple of Deceit", "Temple of Malice", "Temple of Abandon", "Temple of Plenty", "Temple of Silence", "Temple of Malady", "Temple of Mystery", "Temple of Epiphany", "Temple of Triumph"] },
        { id: "surveil", label: "Surveil lands", names: ["Meticulous Archive", "Undercity Sewers", "Raucous Theater", "Commercial District", "Lush Portico", "Shadowy Backstreet", "Underground Mortuary", "Hedge Maze", "Thundering Falls", "Elegant Parlor"] },
        { id: "verge", label: "Verge lands", names: ["Floodfarm Verge", "Gloomlake Verge", "Blazemire Verge", "Thornspire Verge", "Hushwood Verge", "Bleachbone Verge", "Wastewood Verge", "Willowrush Verge", "Riverpyre Verge", "Sunbillow Verge"] },
        { id: "gain", label: "Gain lands", names: ["Tranquil Cove", "Dismal Backwater", "Bloodfell Caves", "Rugged Highlands", "Blossoming Sands", "Scoured Barrens", "Jungle Hollow", "Thornwood Falls", "Swiftwater Cliffs", "Wind-Scarred Crag"] },
        { id: "fast", label: "Fast lands", names: ["Seachrome Coast", "Darkslick Shores", "Blackcleave Cliffs", "Copperline Gorge", "Razorverge Thicket", "Concealed Courtyard", "Spirebluff Canal", "Blooming Marsh", "Inspiring Vantage", "Botanical Sanctum"] },
        { id: "guildgate", label: "Guildgates", names: ["Azorius Guildgate", "Dimir Guildgate", "Rakdos Guildgate", "Gruul Guildgate", "Selesnya Guildgate", "Orzhov Guildgate", "Golgari Guildgate", "Simic Guildgate", "Izzet Guildgate", "Boros Guildgate"] },
        { id: "desert", label: "Desert pingers", names: ["Lonely Arroyo", "Soured Springs", "Jagged Barrens", "Bristling Backwoods", "Creosote Heath", "Forlorn Flats", "Festering Gulch", "Lush Oasis", "Eroded Canyon", "Abraded Bluffs"] },
        { id: "creature", label: "Creature lands (Restless)", names: ["Restless Anchorage", "Restless Reef", "Restless Vents", "Restless Ridgeline", "Restless Prairie", "Restless Bivouac", "Restless Cottage", "Restless Fortress", "Restless Spire", "Restless Vinestalk"] },
        { id: "fetch", label: "Fetch lands", names: ["Flooded Strand", "Polluted Delta", "Bloodstained Mire", "Wooded Foothills", "Windswept Heath", "Marsh Flats", "Scalding Tarn", "Verdant Catacombs", "Arid Mesa", "Misty Rainforest"] },
        { id: "original", label: "Original dual lands", names: ["Tundra", "Underground Sea", "Badlands", "Taiga", "Savannah", "Scrubland", "Volcanic Island", "Bayou", "Plateau", "Tropical Island"] },
        { id: "check", label: "Check lands", names: ["Glacial Fortress", "Drowned Catacomb", "Dragonskull Summit", "Rootbound Crag", "Sunpetal Grove", "Isolated Chapel", "Sulfur Falls", "Woodland Cemetery", "Clifftop Retreat", "Hinterland Harbor"] },
        { id: "pain", label: "Pain lands", names: ["Adarkar Wastes", "Underground River", "Sulfurous Springs", "Karplusan Forest", "Brushland", "Caves of Koilos", "Shivan Reef", "Llanowar Wastes", "Battlefield Forge", "Yavimaya Coast"] },
        { id: "filter", label: "Filter lands", names: ["Mystic Gate", "Sunken Ruins", "Graven Cairns", "Fire-Lit Thicket", "Wooded Bastion", "Fetid Heath", "Cascade Bluffs", "Twilight Mire", "Rugged Prairie", "Flooded Grove"] },
        { id: "bounce", label: "Bounce lands (Karoos)", names: ["Azorius Chancery", "Dimir Aqueduct", "Rakdos Carnarium", "Gruul Turf", "Selesnya Sanctuary", "Orzhov Basilica", "Golgari Rot Farm", "Simic Growth Chamber", "Izzet Boilerworks", "Boros Garrison"] },
        { id: "bond", label: "Bond lands (Battlebond / CMR)", names: ["Sea of Clouds", "Morphic Pool", "Luxury Suite", "Spire Garden", "Bountiful Promenade", "Vault of Champions", "Training Center", "Undergrowth Stadium", "Rejuvenating Springs", "Spectator Seating"] },
        { id: "battle", label: "Battle lands (tango)", names: ["Prairie Stream", "Sunken Hollow", "Smoldering Marsh", "Cinder Glade", "Canopy Vista"] },
        { id: "horizon", label: "Horizon lands", names: ["Horizon Canopy", "Silent Clearing", "Fiery Islet", "Nurturing Peatland", "Sunbaked Canyon", "Waterlogged Grove"] },
        { id: "triome", label: "Triomes", names: ["Raugrin Triome", "Savai Triome", "Zagoth Triome", "Ketria Triome", "Indatha Triome", "Spara's Headquarters", "Raffine's Tower", "Xander's Lounge", "Ziatora's Proving Ground", "Jetmir's Garden"] },
        // Pathways are modal double-faced; a substring name match finds "Front // Back".
        { id: "pathway", label: "Pathways", substring: true, names: ["Hengegate Pathway", "Clearwater Pathway", "Cragcrown Pathway", "Needleverge Pathway", "Riverglide Pathway", "Brightclimb Pathway", "Darkbore Pathway", "Branchloft Pathway", "Blightstep Pathway", "Barkchannel Pathway"] },
        { id: "random", label: "Random: a different cycle for each pack" }
    ];

    function landCycleQuery(cycle) {
        const parts = cycle.names.map(n => cycle.substring ? `name:"${n}"` : `!"${n}"`);
        return `(${parts.join(" or ")}) game:paper -is:promo`;
    }

    // ---------------------------------------------------------------------
    // Card classification helpers (used to split pools for commander sets)
    // ---------------------------------------------------------------------
    const typeLine = c => c.type_line || (c.card_faces ? c.card_faces.map(f => f.type_line).join(" // ") : "");
    const isLegendCreatureOrPW = c => /Legendary/.test(typeLine(c)) && /(Creature|Planeswalker)/.test(typeLine(c));
    const isBackground = c => /Background/.test(typeLine(c));
    const isPiper = c => c.name === "The Prismatic Piper";

    // ---------------------------------------------------------------------
    // Probability helpers
    // ---------------------------------------------------------------------
    const clamp01 = x => Math.max(0, Math.min(1, x));

    // count of distinct card names in a pool key (or first non-empty key of an array)
    function poolCount(stats, key) {
        if (!stats) return null;
        if (key === "LIST") return Infinity;
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) if ((stats[k] || 0) > 0) return stats[k];
        return 0;
    }

    // Standard mythic share: each mythic is printed half as often as each rare.
    function mythicShare(stats, rKey, mKey) {
        if (!stats) return { p: null, formula: "M ÷ (2R + M)" };
        const R = poolCount(stats, rKey), M = poolCount(stats, mKey);
        if (M === 0) return { p: 0, formula: "no mythics in pool" };
        if (R === 0) return { p: 1, formula: "no rares in pool" };
        return { p: M / (2 * R + M), formula: `M ÷ (2R + M) = ${M} ÷ (2×${R} + ${M})` };
    }

    /*
     * Probability of each tier ∝ weight × number of cards in that tier.
     * tiers: [{ pool, label, w }]
     */
    function weightedTiers(stats, tiers, extra) {
        if (!stats) {
            return tiers.map(t => Object.assign({ p: null, pool: t.pool, label: t.label, formula: `weight ${fmtW(t.w)} × #cards` }, extra));
        }
        const raw = tiers.map(t => t.w * poolCount(stats, t.pool));
        const total = raw.reduce((a, b) => a + b, 0) || 1;
        return tiers.map((t, i) => Object.assign({
            p: raw[i] / total, pool: t.pool, label: t.label,
            formula: `${fmtW(t.w)} × ${poolCount(stats, t.pool)} cards`
        }, extra));
    }
    const fmtW = w => (Math.round(w * 100) / 100).toString();

    // Scale a list of outcomes by a factor (for nesting one choice inside another)
    function scale(outcomes, f) {
        return outcomes.map(o => Object.assign({}, o, { p: o.p == null || f == null ? null : o.p * f }));
    }

    // Rare-or-mythic pair
    function rareMythic(stats, rKey, mKey, mult, labels, extra) {
        const ms = mythicShare(stats, rKey, mKey);
        const pM = ms.p == null ? null : clamp01(ms.p * mult);
        const f = mult > 1 ? `${ms.formula} × ${mult} (fun)` : ms.formula;
        return [
            Object.assign({ pool: rKey, label: labels[0], p: pM == null ? null : 1 - pM, formula: "1 − mythic share" }, extra),
            Object.assign({ pool: mKey, label: labels[1], p: pM, formula: f }, extra)
        ];
    }

    /*
     * Drop outcomes whose pool is empty and renormalise the remainder.
     * Used by both the explanation table and the generator.
     */
    function finalize(outcomes, stats) {
        if (!stats || outcomes.some(o => o.p == null)) return outcomes;
        const kept = outcomes.filter(o => o.p > 0 && poolCount(stats, o.pool) > 0);
        const total = kept.reduce((a, o) => a + o.p, 0);
        if (total <= 0) return kept;
        return kept.map(o => Object.assign({}, o, { p: o.p / total }));
    }

    // Foil slot ("traditional foil of any rarity") — per-card weights 4:2:1:½.
    // Calibrated against Duskmourn's published foil sheet (~58% commons).
    function anyRarityFoil(stats, keys, mult, extra) {
        const fun = mult > 1;
        const tiers = [
            { pool: keys.C, label: "Common", w: fun ? 0 : 4 },
            { pool: keys.U, label: "Uncommon", w: 2 },
            { pool: keys.R, label: "Rare", w: 1 * mult },
            { pool: keys.M, label: "Mythic", w: 0.5 * mult }
        ].filter(t => t.w > 0);
        return weightedTiers(stats, tiers, extra);
    }

    // ---------------------------------------------------------------------
    // PLAY BOOSTER
    // opts: { vanilla, mult, foilToggle, listToggle, listEra }
    // ---------------------------------------------------------------------
    function playSpec(opts, stats) {
        const v = opts.vanilla;
        const mult = v ? 1 : opts.mult;
        const slots = [];
        const nf = { foil: 0 };

        slots.push({ n: 6, title: "Common", types: "Any non-basic common", outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }] });

        // Slot 7
        let spgP, listP;
        if (v) {
            spgP = 1 / 64;
            listP = opts.listEra ? 0.125 - spgP : 0;
        } else {
            spgP = clamp01(0.015 * mult);
            listP = opts.listToggle ? Math.min(1 - spgP, 0.125 * mult) : 0;
        }
        const slot7 = [{ pool: "commons", label: "Common", p: 1 - spgP - listP, foil: 0 }];
        if (listP > 0) slot7.push({ pool: "LIST", label: "The List", tag: "The List", p: listP, foil: 0, formula: v ? "12.5% List slot minus Special Guests" : `12.5% × ${mult}` });
        slot7.push({ pool: "spg", label: "Special Guest", tag: "Special Guest", p: spgP, foil: 0, formula: v ? "1 in 64 packs" : `1.5% × ${mult}` });
        slots.push({ n: 1, affects: v ? [] : ["mult", "listToggle"], title: listP > 0 ? "Common / The List / Special Guest" : "Common or Special Guest", types: "Common from the set, or a Special Guests / The List card", outcomes: slot7 });

        slots.push({ n: 3, title: "Uncommon", types: "Any non-basic uncommon", outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1, foil: 0 }] });

        if (v) {
            slots.push({ n: 1, title: "Rare or mythic", types: "Any non-basic rare or mythic", outcomes: rareMythic(stats, "rares", "mythics", 1, ["Rare", "Mythic"], nf) });
            slots.push({
                n: 1, title: "Land", types: "Basic land, or one of the set's common dual lands",
                outcomes: [
                    { pool: ["landBasics", "nonBasicLands", "commons"], label: "Basic land", p: 0.5, foil: 0.2, formula: "half of land slots (Duskmourn sheet); 20% foil" },
                    { pool: "landDuals", label: "Common dual land", p: 0.5, foil: 0.2, formula: "half of land slots, if the set has common duals; 20% foil" }
                ]
            });
            const rm = rareMythic(stats, "rares", "mythics", 1, ["Rare", "Mythic"], nf);
            slots.push({
                n: 1, title: "Wildcard (non-foil)", types: "Any non-basic card of any rarity",
                outcomes: [
                    { pool: "commons", label: "Common", p: 0.18, foil: 0, formula: "≈18% (Duskmourn sheet)" },
                    { pool: "uncommons", label: "Uncommon", p: 0.67, foil: 0, formula: "≈67% (Duskmourn sheet)" }
                ].concat(scale(rm, 0.15).map(o => Object.assign(o, { formula: "≈15% rare/mythic, split " + (o.label === "Mythic" ? "by mythic share" : "by rare share") })))
            });
            slots.push({
                n: 1, title: "Foil wildcard", types: "Any non-basic card of any rarity, traditional foil",
                outcomes: anyRarityFoil(stats, { C: "commons", U: "uncommons", R: "rares", M: "mythics" }, 1, { foil: 1 })
            });
        } else {
            const wild = (foil) => weightedTiers(stats, [
                { pool: "commons", label: "Common", w: mult > 1 ? 0 : 1 },
                { pool: "uncommons", label: "Uncommon", w: 1 },
                { pool: "rares", label: "Rare", w: 1 },
                { pool: "mythics", label: "Mythic", w: 1 }
            ].filter(t => t.w > 0), { foil });
            slots.push({ n: 1, affects: ["mult"], title: "Wildcard", types: mult > 1 ? "Any non-basic uncommon/rare/mythic (commons removed by multiplier)" : "Any non-basic card, every card name equally likely", outcomes: wild(0) });
            const pM = clamp01(0.13 * mult);
            slots.push({
                n: 1, title: "Rare or mythic", types: "Any non-basic rare or mythic", affects: ["mult"],
                outcomes: [
                    { pool: "rares", label: "Rare", p: 1 - pM, foil: 0, formula: "1 − mythic chance" },
                    { pool: "mythics", label: "Mythic", p: pM, foil: 0, formula: mult > 1 ? `13% × ${mult}` : "13%" }
                ]
            });
            slots.push({ n: 1, affects: ["mult", "foilToggle"], title: opts.foilToggle ? "Wildcard (foil)" : "Wildcard", types: "Same pool as the first wildcard", outcomes: wild(opts.foilToggle ? 1 : 0) });
            slots.push({
                n: 1, affects: ["landUpgrade"], title: "Land (upgraded)", types: "Random non-basic land from the set (replaces the basic)",
                outcomes: [{ pool: ["nonBasicLands", "uncommons"], label: "Non-basic land", p: 1, foil: 0, formula: "falls back to an uncommon if the set has no non-basic lands" }]
            });
        }
        return finalizeSlots(slots, stats);
    }

    // ---------------------------------------------------------------------
    // COMMANDER DRAFT BOOSTERS
    // layout: "cmr" | "clb" | "cmm" — the official set, or the layout borrowed
    // when a commander-style booster is built from any other set.
    // opts: { vanilla, mult }
    //
    // Pools are listed with fallbacks (first non-empty wins) so a set with few
    // legends or no Backgrounds still fills every guaranteed slot.
    // ---------------------------------------------------------------------
    const LAYOUTS = {
        cmr: "Commander Legends layout",
        clb: "Battle for Baldur's Gate layout",
        cmm: "Commander Masters layout"
    };
    const P = {
        legU: ["legU", "legC", "legAll", "uncommons"],
        legR: ["legR", "legAll", "rares"],
        legM: ["legM"],
        bgCU: ["bgCU", "legU", "legC", "legAll", "uncommons"],
        bgR: ["bgR", "legR", "legAll", "rares"]
    };

    function commanderSpec(layout, opts, stats) {
        const mult = opts.vanilla ? 1 : opts.mult;
        const fx = mult > 1 ? ` × ${mult} (fun)` : "";
        const nf = { foil: 0 };
        const M = ["mult"];
        const slots = [];
        const common = (n) => ({ n, title: "Common", types: "Common (no Backgrounds)", outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }] });
        const piperSlot = () => {
            const hasPiper = !stats || (stats.piper || 0) > 0;
            return {
                n: 1, title: hasPiper ? "Common or Prismatic Piper" : "Common",
                types: hasPiper ? "Common, or The Prismatic Piper" : "Common (this set has no Prismatic Piper)",
                outcomes: [
                    { pool: "commons", label: "Common", p: 5 / 6, foil: 0 },
                    { pool: "piper", label: "The Prismatic Piper", tag: "Prismatic Piper", p: 1 / 6, foil: 0, formula: "1 in 6 packs" }
                ]
            };
        };
        const nlUnc = (n) => ({ n, title: "Uncommon", types: "Nonlegendary uncommon", outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1, foil: 0 }] });
        const nlRare = () => ({ n: 1, title: "Rare or mythic", types: "Nonlegendary rare or mythic", affects: M, outcomes: rareMythic(stats, "rares", "mythics", mult, ["Rare", "Mythic"], nf) });
        const allKeys = { C: "allC", U: "allU", R: "allR", M: "allM" };
        const foilAny = (etchedP) => {
            let outs = anyRarityFoil(stats, allKeys, mult, { foil: 1 });
            if (etchedP > 0) {
                outs = [{ pool: ["etched", "legAll"], label: "Foil-etched legend", p: etchedP, foil: "etched", formula: `1 in 15 packs${fx}` }]
                    .concat(scale(outs, 1 - etchedP));
            }
            return { n: 1, title: "Foil", types: "Any card of any rarity, traditional foil" + (etchedP > 0 ? " (or a foil-etched legend)" : ""), affects: M, outcomes: outs };
        };

        if (layout === "cmr") {
            slots.push(common(12), piperSlot(), nlUnc(3));
            slots.push({
                n: 2, title: "Legendary", types: "Legendary creature or planeswalker (any rarity)", affects: M,
                outcomes: weightedTiers(stats, [
                    { pool: P.legU, label: "Legendary uncommon", w: 4 },
                    { pool: P.legR, label: "Legendary rare", w: 2 * mult },
                    { pool: P.legM, label: "Legendary mythic", w: 1 * mult }
                ], nf)
            });
            slots.push(nlRare());
            slots.push(foilAny(clamp01((1 / 15) * mult)));
        } else if (layout === "clb") {
            slots.push(common(13), nlUnc(3));
            const pRM = clamp01(0.31 * mult);
            const legRM = rareMythic(stats, P.legR, P.legM, mult, ["Legendary rare", "Legendary mythic"], nf);
            slots.push({
                n: 1, title: "Legendary", types: "Legendary creature or planeswalker", affects: M,
                outcomes: [{ pool: P.legU, label: "Legendary uncommon", p: 1 - pRM, foil: 0, formula: "1 − rare/mythic chance" }]
                    .concat(scale(legRM, pRM).map(o => Object.assign(o, { formula: `31%${fx} rare/mythic, then ${o.label.endsWith("mythic") ? "mythic" : "rare"} share` })))
            });
            const pBR = clamp01((1 / 12) * mult);
            const hasBg = !stats || (stats.bgCU || 0) + (stats.bgR || 0) > 0;
            slots.push({
                n: 1, title: "Background", affects: M,
                types: hasBg ? "Legendary Background enchantment" : "Legendary creature or planeswalker (this set has no Backgrounds)",
                outcomes: [
                    { pool: P.bgCU, label: hasBg ? "Common/uncommon Background" : "Legendary uncommon", p: 1 - pBR, foil: 0, formula: "1 − rare chance" },
                    { pool: P.bgR, label: hasBg ? "Rare Background" : "Legendary rare", p: pBR, foil: 0, formula: `1 in 12 packs${fx}` }
                ]
            });
            slots.push(nlRare());
            slots.push(foilAny(0));
        } else if (layout === "cmm") {
            slots.push(common(10), piperSlot(), nlUnc(3));
            slots.push({ n: 2, title: "Legendary uncommon", types: "Legendary creature or planeswalker, uncommon", outcomes: [{ pool: P.legU, label: "Legendary uncommon", p: 1, foil: 0 }] });
            slots.push({ n: 1, title: "Legendary rare or mythic", types: "Legendary creature or planeswalker, rare or mythic", affects: M, outcomes: rareMythic(stats, P.legR, P.legM, mult, ["Legendary rare", "Legendary mythic"], nf) });
            slots.push(nlRare());
            const pFlex = clamp01((1 / 3) * mult);
            const flexRM = rareMythic(stats, "rares", "mythics", mult, ["Rare", "Mythic"], nf);
            slots.push({
                n: 1, title: "Uncommon or rare", types: "Nonlegendary uncommon, rare or mythic", affects: M,
                outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1 - pFlex, foil: 0, formula: "2 in 3 packs" + (mult > 1 ? " (reduced by fun)" : "") }]
                    .concat(scale(flexRM, pFlex).map(o => Object.assign(o, { formula: `1 in 3${fx}, then ${o.label === "Mythic" ? "mythic" : "rare"} share` })))
            });
            slots.push(foilAny(0));
        }
        return finalizeSlots(slots, stats);
    }

    // Which pool key actually supplies an outcome (first non-empty in a fallback list)
    function usedPool(stats, key) {
        if (!stats || !Array.isArray(key)) return Array.isArray(key) ? key[0] : key;
        for (const k of key) if ((stats[k] || 0) > 0) return k;
        return key[0];
    }

    function finalizeSlots(slots, stats) {
        let pos = 1;
        return slots.map(s => {
            const out = Object.assign({}, s, { outcomes: finalize(s.outcomes, stats), from: pos, to: pos + s.n - 1 });
            pos += s.n;
            return out;
        });
    }

    // ---------------------------------------------------------------------
    // Sampling
    // ---------------------------------------------------------------------
    function resolvePool(pools, key) {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) { const m = pools[k]; if (m && m.size) return m; }
        return null;
    }

    function chooseOutcome(outcomes, rng) {
        const total = outcomes.reduce((a, o) => a + (o.p || 0), 0);
        let r = rng() * total;
        for (const o of outcomes) { r -= (o.p || 0); if (r <= 0) return o; }
        return outcomes[outcomes.length - 1];
    }

    function pickFromMap(nameMap, rng) {
        const names = Array.from(nameMap.keys());
        if (!names.length) return null;
        const name = names[Math.floor(rng() * names.length)];
        const variants = nameMap.get(name);
        return variants[Math.floor(rng() * variants.length)];
    }

    function finishFor(outcome, rng) {
        if (outcome.foil === "etched") return "etched";
        return rng() < (outcome.foil || 0) ? "foil" : "nonfoil";
    }

    function statsFromPools(pools) {
        const s = {};
        for (const k in pools) s[k] = pools[k] instanceof Map ? pools[k].size : 0;
        return s;
    }

    // Reversible printings are named "X // X"; group them with the normal "X".
    function nameKey(c) {
        const parts = (c.name || "").split(" // ");
        return parts.length === 2 && parts[0] === parts[1] ? parts[0] : c.name;
    }

    function groupByName(cards) {
        const map = new Map();
        cards.forEach(c => {
            const k = nameKey(c);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(c);
        });
        return map;
    }

    // Expected number of cards per pack for each outcome label
    function expectedCounts(slots) {
        const exp = {};
        slots.forEach(s => s.outcomes.forEach(o => {
            if (o.p == null) return;
            exp[o.label] = (exp[o.label] || 0) + s.n * o.p;
            if (o.foil === "etched" || o.foil > 0) exp.__foil = (exp.__foil || 0) + s.n * o.p * (o.foil === "etched" ? 1 : o.foil);
        }));
        return exp;
    }

    // ---------------------------------------------------------------------
    // Vanilla comparison
    // ---------------------------------------------------------------------
    /*
     * Compare a spec with the same set's vanilla spec, so the panel can show
     * what the chosen options actually changed instead of only which option
     * touches a slot. Both specs are built from the same `stats`, so anything
     * caused by the set's own contents (no mythics, no Backgrounds, empty
     * pools dropped and renormalised) cancels out, leaving only the changes
     * the options are responsible for.
     *
     * Slots are aligned by card position: each slot is compared with the
     * vanilla slot holding its first card. Play Boosters reorder and retitle
     * slots between vanilla and fun mode, so the two lists are not parallel.
     *
     * Returns one array of change records per slot, for the UI to format:
     *   { kind: "title",   fromTitle, toTitle }
     *   { kind: "added",   label, toP }
     *   { kind: "removed", label, fromP }
     *   { kind: "p",       label, fromP, toP }
     *   { kind: "foil",    label, fromFoil, toFoil }
     */
    const DIFF_EPS = 0.005; // ignore sub-half-point wobble from renormalising

    function slotAtPosition(slots, pos) {
        for (const s of slots) if (pos >= s.from && pos <= s.to) return s;
        return null;
    }

    // label -> { p, foil }. A label can appear more than once in a slot (a
    // fallback pool landing on a tier that is already there), so chances add.
    function outcomesByLabel(slot) {
        const m = new Map();
        for (const o of slot.outcomes) {
            const prev = m.get(o.label);
            if (!prev) m.set(o.label, { p: o.p, foil: o.foil });
            else prev.p = prev.p == null || o.p == null ? null : prev.p + o.p;
        }
        return m;
    }

    function diffSlotFromVanilla(slot, vSlot) {
        const changes = [];
        if (!vSlot) return changes;
        if (slot.title !== vSlot.title) changes.push({ kind: "title", fromTitle: vSlot.title, toTitle: slot.title });
        const cur = outcomesByLabel(slot), van = outcomesByLabel(vSlot);
        cur.forEach((o, label) => {
            const v = van.get(label);
            if (!v) { changes.push({ kind: "added", label: label, toP: o.p }); return; }
            if (o.p != null && v.p != null && Math.abs(o.p - v.p) >= DIFF_EPS) changes.push({ kind: "p", label: label, fromP: v.p, toP: o.p });
            if (String(o.foil || 0) !== String(v.foil || 0)) changes.push({ kind: "foil", label: label, fromFoil: v.foil || 0, toFoil: o.foil || 0 });
        });
        van.forEach((v, label) => { if (!cur.has(label)) changes.push({ kind: "removed", label: label, fromP: v.p }); });
        return changes;
    }

    function diffFromVanilla(slots, vanillaSlots) {
        if (!vanillaSlots) return slots.map(() => []);
        return slots.map(s => diffSlotFromVanilla(s, slotAtPosition(vanillaSlots, s.from)));
    }

    const api = {
        COMMANDER_SETS, LAYOUTS, usedPool, PLAY_BOOSTER_START, LIST_ERA_END, LAND_CYCLES, landCycleQuery,
        isLegendCreatureOrPW, isBackground, isPiper, typeLine,
        playSpec, commanderSpec, finalize, poolCount, diffFromVanilla,
        resolvePool, chooseOutcome, pickFromMap, finishFor, statsFromPools, groupByName, nameKey, expectedCounts
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.BoosterLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
