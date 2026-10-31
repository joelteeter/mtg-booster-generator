/*
 * The built-in "Classic" bonus land cycle: original dual lands and fetch
 * lands, as fixed printings rather than a Scryfall query.
 *
 * These are hardcoded because the cycle spans 30th Anniversary Edition and two
 * Modern Horizons sets, and no single query picks out exactly this set of
 * printings. `section` is not a Scryfall field — it marks which column of the
 * separator sheet the card belongs in, and the generator reads it back off
 * whichever card it picked.
 *
 * Copied verbatim from `js/scryfall.js`; prices are a snapshot and are only
 * ever displayed, never computed with.
 */
import type { Card } from "./types";

export const bonusPool: Card[] = [
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
