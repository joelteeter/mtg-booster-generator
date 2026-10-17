/*
 * scryfall.js
 * -----------
 * Scryfall access (shared request queue, retries on 429), card pools for
 * Play and Commander boosters, Special Guests, set metadata and the bonus
 * (separator) land cycles.
 */
"use strict";

// Classic bonus pool (original duals + fetch lands, fixed printings)
const bonusPool = [
    { section: "columna", name: "Plateau", mana_cost: "", type_line: "Land — Mountain Plains", set_name: "30th Anniversary Edition", set: "30a", collector_number: "275", artist: "Drew Tucker", usd: "210.25", eur: "250.57", tix: "2.96", uri: "https://scryfall.com", id: "d5ba61cb-0c57-4a94-91a9-6ce0a27b9db7" },
    { section: "columna", name: "Scrubland", mana_cost: "", type_line: "Land — Plains Swamp", set_name: "30th Anniversary Edition", set: "30a", collector_number: "277", artist: "Jesper Myrfors", usd: "228.59", eur: "100.0", tix: "3.74", uri: "https://scryfall.com", id: "eb9a95ba-4c64-4547-b497-d06f3b9a397f" },
    { section: "columna", name: "Underground Sea", mana_cost: "", type_line: "Land — Island Swamp", set_name: "30th Anniversary Edition", set: "30a", collector_number: "281", artist: "Rob Alexander", usd: "316.58", eur: "280.0", tix: "15.04", uri: "https://scryfall.com", id: "cbde3041-fb76-4dc8-9cdf-359ad955fd73" },
    { section: "columnb", name: "Misty Rainforest", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 2", set: "mh2", collector_number: "477", artist: "Shelly Wan", usd: "32.54", eur: "28.37", tix: "2.09", uri: "https://scryfall.com", id: "23d8e67a-5150-4782-98d1-da2ca79607ad" },
    { section: "columnb", name: "Windswept Heath", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 3", set: "mh3", collector_number: "466", artist: "Alexander Forssberg", usd: "14.45", eur: "10.3", tix: "1.25", uri: "https://scryfall.com", id: "3de8387d-a707-4c2b-9661-c586b7d0db50" },
    { section: "columna", name: "Tropical Island", mana_cost: "", type_line: "Land — Forest Island", set_name: "30th Anniversary Edition", set: "30a", collector_number: "279", artist: "Jesper Myrfors", usd: "271.66", eur: "372.53", tix: "11.04", uri: "https://scryfall.com", id: "2d9d4f2e-5a41-410d-b1c3-47e4aca07177" },
    { section: "columna", name: "Bayou", mana_cost: "", type_line: "Land — Swamp Forest", set_name: "30th Anniversary Edition", set: "30a", collector_number: "274", artist: "Jesper Myrfors", usd: "222.46", eur: "249.98", tix: "5.51", uri: "https://scryfall.com", id: "538dfd90-5215-4aa0-8e10-1e6fd9f717c8" },
    { section: "columnb", name: "Flooded Strand", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 3", set: "mh3", collector_number: "464", artist: "Alexander Forssberg", usd: "18.35", eur: "16.61", tix: "3.67", uri: "https://scryfall.com", id: "431eca69-ba8c-47c8-a325-22a844f83e80" },
    { section: "columnb", name: "Wooded Foothills", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 3", set: "mh3", collector_number: "467", artist: "Chris Ostrowski", usd: "20.86", eur: "17.29", tix: "2.46", uri: "https://scryfall.com", id: "32af6676-e780-4ebf-b2d3-0bc3436e527c" },
    { section: "columnb", name: "Polluted Delta", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 3", set: "mh3", collector_number: "465", artist: "Chris Ostrowski", usd: "23.64", eur: "18.5", tix: "1.95", uri: "https://scryfall.com", id: "797b30b0-bc82-43fd-a842-d5879e2441bd" },
    { section: "columna", name: "Savannah", mana_cost: "", type_line: "Land — Forest Plains", set_name: "30th Anniversary Edition", set: "30a", collector_number: "276", artist: "Rob Alexander", usd: "183.66", eur: "209.76", tix: "3.69", uri: "https://scryfall.com", id: "3af5afd0-1b5b-4055-9d90-87356090911f" },
    { section: "columna", name: "Taiga", mana_cost: "", type_line: "Land — Mountain Forest", set_name: "30th Anniversary Edition", set: "30a", collector_number: "278", artist: "Rob Alexander", usd: "260.0", eur: "220.13", tix: "3.56", uri: "https://scryfall.com", id: "e53c3622-1000-4727-9473-bacf20c8d682" },
    { section: "columnb", name: "Verdant Catacombs", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 2", set: "mh2", collector_number: "479", artist: "Vance Kovacs", usd: "28.94", eur: "24.08", tix: "0.99", uri: "https://scryfall.com", id: "c7057b04-e22f-4e33-9f08-b9fbd2e54bf5" },
    { section: "columna", name: "Tundra", mana_cost: "", type_line: "Land — Plains Island", set_name: "30th Anniversary Edition", set: "30a", collector_number: "280", artist: "Jesper Myrfors", usd: "237.49", eur: "0.25", tix: "11.96", uri: "https://scryfall.com", id: "79fc39a1-6a9d-4893-a41b-e8d13fb0d108" },
    { section: "columna", name: "Badlands", mana_cost: "", type_line: "Land — Swamp Mountain", set_name: "30th Anniversary Edition", set: "30a", collector_number: "273", artist: "Rob Alexander", usd: "298.2", eur: "0.02", tix: "4.57", uri: "https://scryfall.com", id: "c5335e87-57e3-4da6-aba0-619628120f47" },
    { section: "columnb", name: "Arid Mesa", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 2", set: "mh2", collector_number: "475", artist: "Raymond Swanland", usd: "31.7", eur: "28.42", tix: "3.65", uri: "https://scryfall.com", id: "54ced5cf-b51a-4dab-97f7-50fb18e5c463" },
    { section: "columna", name: "Volcanic Island", mana_cost: "", type_line: "Land — Island Mountain", set_name: "30th Anniversary Edition", set: "30a", collector_number: "282", artist: "Brian Snõddy", usd: "295.29", eur: "527.22", tix: "11.51", uri: "https://scryfall.com", id: "12f74d08-d020-4c89-a1a2-0815b8b65755" },
    { section: "columnb", name: "Bloodstained Mire", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 3", set: "mh3", collector_number: "463", artist: "Bruce Brenneise", usd: "20.33", eur: "17.65", tix: "2.13", uri: "https://scryfall.com", id: "3de472d0-cca2-4bc3-ab0a-9f79fa6325ce" },
    { section: "columnb", name: "Scalding Tarn", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 2", set: "mh2", collector_number: "478", artist: "Philip Straub", usd: "34.64", eur: "28.19", tix: "3.07", uri: "https://scryfall.com", id: "229ecfc9-8d6b-4fdb-9001-64dc3e4e7a3f" },
    { section: "columnb", name: "Marsh Flats", mana_cost: "", type_line: "Land", set_name: "Modern Horizons 2", set: "mh2", collector_number: "476", artist: "Izzy", usd: "28.91", eur: "24.3", tix: "0.91", uri: "https://scryfall.com", id: "4e8397e6-d13a-4996-8fde-b8a9895de287" }
];

// ------------------------------------------------------------------
// Scryfall access (throttled to ~9 requests/second, paginated)
// ------------------------------------------------------------------
const API = "https://api.scryfall.com/";
// Only CORS-safelisted headers: a custom User-Agent makes the browser send an extra
// OPTIONS "preflight" before every request, doubling the load on Scryfall. The
// browser sends its own User-Agent anyway.
const HEADERS = { 'Accept': 'application/json' };
const REQUEST_GAP_MS = 150;     // ≈6–7 requests/second; Scryfall asks for ≤10/s on average
const MAX_RETRIES = 3;
let nextSlot = 0;

// One shared queue: every Scryfall API request waits for its turn
function takeTurn(extraDelayMs = 0) {
    const now = Date.now();
    const at = Math.max(now, nextSlot) + extraDelayMs;
    nextSlot = at + REQUEST_GAP_MS;
    return at > now ? new Promise(r => setTimeout(r, at - now)) : Promise.resolve();
}

function rateLimitNotice(msg) {
    console.warn(msg);
    const el = document.getElementById('status');
    if (el && el.offsetParent !== null) el.textContent = msg;
    const sim = document.getElementById('simStatus');
    if (sim && sim.offsetParent !== null) sim.textContent = msg;
}

async function sfFetch(url) {
    let backoff = 0;
    for (let attempt = 0; ; attempt++) {
        await takeTurn(backoff);
        let res;
        try {
            res = await fetch(url, { method: 'GET', headers: HEADERS });
        } catch (e) {
            // A 429 without CORS headers shows up as a network error; treat it as "slow down"
            if (attempt >= MAX_RETRIES) throw new Error("Couldn't reach Scryfall (network error or rate limit). Wait a minute and try again.");
            backoff = 10000 * (attempt + 1);
            rateLimitNotice(`⏳ Scryfall didn't answer; trying again in ${backoff / 1000}s…`);
            continue;
        }
        if (res.status !== 429) return res;
        if (attempt >= MAX_RETRIES) throw new Error("Scryfall is rate-limiting requests (429). Wait a minute and try again.");
        const retryAfter = parseFloat(res.headers.get('Retry-After'));
        backoff = (Number.isFinite(retryAfter) ? retryAfter : 10) * 1000 + 500;
        // Hold the whole queue, so other pending requests don't keep hitting the limit
        nextSlot = Math.max(nextSlot, Date.now() + backoff);
        rateLimitNotice(`⏳ Scryfall asked us to slow down; continuing in ${Math.ceil(backoff / 1000)}s…`);
        backoff = 0;
    }
}

async function fetchPool(query) {
    // unique:prints returns every art variant; follow next_page so big sets aren't cut off at 175 cards
    let url = API + "cards/search?q=" + encodeURIComponent(query + " unique:prints");
    const out = [];
    while (url) {
        const response = await sfFetch(url);
        if (!response.ok) {
            if (response.status === 404) return out;
            throw new Error(`Scryfall API Error: ${response.status}`);
        }
        const data = await response.json();
        out.push(...data.data);
        url = data.has_more ? data.next_page : null;
    }
    return out;
}
const optional = p => p.catch(e => { console.warn("Optional query failed:", e.message); return []; });

async function fetchRandom(query) {
    const res = await sfFetch(API + "cards/random?q=" + encodeURIComponent(query));
    if (!res.ok) throw new Error(`Scryfall API Error: ${res.status}`);
    return res.json();
}

let spgPromise = null;
function getSpg() {
    if (!spgPromise) spgPromise = fetchPool(`set:spg`).catch(e => { spgPromise = null; throw e; });
    return spgPromise;
}

async function getSetMeta(code) {
    if (setMeta[code]) return setMeta[code];
    try {
        const res = await sfFetch(API + "sets/" + code);
        if (res.ok) setMeta[code] = await res.json();
    } catch (e) { /* not fatal */ }
    return setMeta[code] || null;
}

// ------------------------------------------------------------------
// Card pools
// ------------------------------------------------------------------
async function loadPlayPools(code) {
    const s = `s:${code} -is:promo`;
    const [C0, U0, R0, M0, nonBasicLands0, landSlot, boosterCards, spgAll, meta] = await Promise.all([
        fetchPool(`${s} r:common -t:basic`),
        fetchPool(`${s} r:uncommon -t:basic`),
        fetchPool(`${s} r:rare -t:basic`),
        fetchPool(`${s} r:mythic -t:basic`),
        fetchPool(`${s} t:land -t:basic`),
        optional(fetchPool(`${s} (t:basic or (r:common t:land -t:creature))`)),
        // Many set codes also hold cards that aren't in Play Boosters (e.g. Foundations'
        // starter-kit cards); is:booster says which are. Some sets have no is:booster
        // data on Scryfall yet; then every card is kept.
        optional(fetchPool(`${s} is:booster -t:basic`)),
        getSpg(),
        getSetMeta(code)
    ]);
    if (R0.length === 0) throw new Error(`Set "${code.toUpperCase()}" not found (no rares).`);
    const G = L.groupByName;
    const inBooster = new Set(boosterCards.map(c => c.name + '|' + c.rarity));
    const keep = arr => {
        if (!inBooster.size) return arr;
        const kept = arr.filter(c => inBooster.has(c.name + '|' + c.rarity));
        return kept.length ? kept : arr;
    };
    // Real Play Boosters put the set's common dual lands in the land slot only (half
    // the time; basics the other half), so they're taken out of the common slots.
    // Other common lands such as Terramorphic Expanse stay on the common sheet.
    const isBasic = c => /Basic/.test(c.type_line || '');
    const isCommonDual = c => !isBasic(c) && (c.produced_mana || []).filter(m => 'WUBRG'.includes(m)).length >= 2;
    const landBasics = landSlot.filter(isBasic);
    const landDuals = landSlot.filter(isCommonDual);
    const landSlotOnly = new Set(landDuals.map(c => c.name));
    const commons = keep(C0).filter(c => !landSlotOnly.has(c.name));
    // Special Guests: only this set's own (they share its release date)
    const released = meta && meta.released_at;
    const ownSpg = released ? spgAll.filter(c => c.released_at === released) : [];
    return {
        commons: G(commons.length ? commons : C0), uncommons: G(keep(U0)), rares: G(keep(R0)), mythics: G(keep(M0)),
        nonBasicLands: G(keep(nonBasicLands0)), landBasics: G(landBasics), landDuals: G(landDuals),
        spg: G(ownSpg.length ? ownSpg : spgAll), spgAll: G(spgAll),
        meta: { boosterFiltered: inBooster.size > 0, ownSpg: ownSpg.length, landSlotOnly: landSlotOnly.size }
    };
}

async function loadCommanderPools(code) {
    const s = `s:${code} -is:promo`;
    const [C0, U0, R0, M0, boosterCards, piper, etched, spg] = await Promise.all([
        fetchPool(`${s} r:common -t:basic`),
        fetchPool(`${s} r:uncommon -t:basic`),
        fetchPool(`${s} r:rare -t:basic`),
        fetchPool(`${s} r:mythic -t:basic`),
        // These set codes also hold their Commander precon deck cards; is:booster
        // tells us which card names actually appear in draft boosters.
        optional(fetchPool(`${s} is:booster -t:basic`)),
        optional(fetchPool(`s:${code} !"The Prismatic Piper"`)),
        code === 'cmr' ? optional(fetchPool(`s:${code} is:etched`)) : Promise.resolve([]),
        getSpg(),
        getSetMeta(code)
    ]);
    if (R0.length === 0) throw new Error(`Set "${code.toUpperCase()}" not found (no rares).`);
    // Keep every printing (showcase, borderless…) of a name+rarity that is in boosters
    const inBooster = new Set(boosterCards.map(c => c.name + '|' + c.rarity));
    const keep = arr => inBooster.size ? arr.filter(c => inBooster.has(c.name + '|' + c.rarity)) : arr;
    const [C, U, R, M] = [keep(C0), keep(U0), keep(R0), keep(M0)];
    const G = L.groupByName;
    const legend = c => L.isLegendCreatureOrPW(c) && !L.isBackground(c);
    const plain = c => !L.isLegendCreatureOrPW(c) && !L.isBackground(c) && !L.isPiper(c);
    return {
        // legendary commons stay in the common slots (the official commander sets have none)
        commons: G(C.filter(c => !L.isBackground(c) && !L.isPiper(c))), uncommons: G(U.filter(plain)), rares: G(R.filter(plain)), mythics: G(M.filter(plain)),
        legC: G(C.filter(legend)), legU: G(U.filter(legend)), legR: G(R.filter(legend)), legM: G(M.filter(legend)),
        legAll: G([...C, ...U, ...R, ...M].filter(legend)),
        bgCU: G([...C, ...U].filter(L.isBackground)), bgR: G([...R, ...M].filter(L.isBackground)),
        piper: G(piper.filter(L.isPiper)),
        etched: G(etched.filter(legend)),
        allC: G(C.filter(c => !L.isPiper(c))), allU: G(U), allR: G(R), allM: G(M),
        spgAll: G(spg)
    };
}

function ensureLoaded(m, code) {
    const key = m + ':' + code;
    if (!poolCache[key]) {
        poolCache[key] = (m === 'play' ? loadPlayPools(code) : loadCommanderPools(code))
            .then(p => { loadedPools[key] = p; return p; })
            .catch(e => { delete poolCache[key]; throw e; });
    }
    return poolCache[key];
}

// ------------------------------------------------------------------
// Bonus land cycles
// ------------------------------------------------------------------
const cycleCache = {};
function loadCycle(cycle) {
    if (cycle.builtIn) return Promise.resolve(L.groupByName(bonusPool));
    if (!cycleCache[cycle.id]) {
        cycleCache[cycle.id] = fetchPool(L.landCycleQuery(cycle) + " -border:gold -is:oversized")
            .then(L.groupByName)
            .catch(e => { delete cycleCache[cycle.id]; throw e; });
    }
    return cycleCache[cycle.id];
}

async function prepareBonus(typeId) {
    const real = L.LAND_CYCLES.filter(c => c.id !== 'random');
    if (typeId === 'random') {
        const maps = [];
        for (const c of real) {
            try { const m = await loadCycle(c); if (m.size) maps.push({ cycle: c, map: m }); } catch (e) { console.warn(`Skipping ${c.label}:`, e.message); }
        }
        if (!maps.length) throw new Error("Could not load any bonus land cycle.");
        return () => {
            const pick = maps[Math.floor(Math.random() * maps.length)];
            const card = L.pickFromMap(pick.map, Math.random);
            return { card, section: card.section || null, cycle: pick.cycle.label };
        };
    }
    const cycle = real.find(c => c.id === typeId) || real[0];
    const map = await loadCycle(cycle);
    if (!map.size) throw new Error(`No printings found for ${cycle.label}.`);
    return () => {
        const card = L.pickFromMap(map, Math.random);
        return { card, section: card.section || null, cycle: cycle.label };
    };
}
