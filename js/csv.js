/*
 * csv.js
 * ------
 * CSV rows in Scryfall's CSV format (what MTGProxyPrinter imports).
 */
"use strict";

// ------------------------------------------------------------------
// CSV
// ------------------------------------------------------------------
function formatToFullCSV(card, finish = "nonfoil", manualSection = null) {
    if (finish === true) finish = "foil";
    if (finish === false) finish = "nonfoil";
    const section = manualSection || (card.type_line && card.type_line.toLowerCase().includes("land") ? "lands" : "nonlands");
    const manaCost = card.mana_cost ?? (card.card_faces ? card.card_faces.map(f => f.mana_cost || '').join(' // ') : '');
    return [
        section, 1, `"${card.name}"`, `"${manaCost || ''}"`, `"${card.type_line || ''}"`,
        `"${card.set_name || ''}"`, card.set || "", `"${card.collector_number || ''}"`,
        card.lang || "en", card.rarity || "", `"${card.artist || ''}"`, finish,
        card.usd || card.prices?.usd || "", card.eur || card.prices?.eur || "",
        card.tix || card.prices?.tix || "", card.scryfall_uri || card.uri || "", card.id || ""
    ].join(",");
}
