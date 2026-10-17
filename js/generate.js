/*
 * generate.js
 * -----------
 * Pack generation: drawing a card for each slot outcome (no repeated names
 * within a pack), the Guest List swap, separator lands, and the Generate button.
 */
"use strict";

// ------------------------------------------------------------------
// Generation
// ------------------------------------------------------------------
// exclude: card names already in this pack. Real packs come from collated print
// sheets, so the same card essentially never appears twice in one pack.
function pickRandomVariant(nameMap, exclude) {
    let names = Array.from(nameMap.keys());
    if (names.length === 0) return null;
    if (exclude && exclude.size) {
        const fresh = names.filter(n => !exclude.has(n));
        if (fresh.length) names = fresh;
    }
    const randomName = names[Math.floor(Math.random() * names.length)];
    const variants = nameMap.get(randomName);
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    if (variants.length > 1) {
        const ids = variants.map(v => v.collector_number).join(", ");
        console.log(`Selection logic: Chose ID ${chosen.collector_number} out of available [${ids}] for card "${randomName}"`);
    }
    return chosen;
}

async function drawCard(outcome, pools, exclude) {
    if (outcome.pool === 'LIST') {
        try {
            const card = await fetchRandom('set:plst');
            console.log(`📜 The List: "${card.name}"`);
            return card;
        } catch (e) {
            console.warn("The List fetch failed, using a common instead:", e.message);
            return pickRandomVariant(pools.commons, exclude);
        }
    }
    const map = L.resolvePool(pools, outcome.pool);
    return map ? pickRandomVariant(map, exclude) : null;
}

genBtn.addEventListener('click', async () => {
    const code = currentCode();
    if (!code) { status.textContent = "❌ Pick a set first."; return; }
    const setCode = code.toUpperCase();
    const packCount = Math.max(1, parseInt($('packCount').value, 10) || 1);
    const opts = getOpts();

    status.textContent = `⏳ Pulling data for ${setCode}...`;
    genBtn.disabled = true;
    $('dlRows').innerHTML = "";
    $('exportStatus').textContent = "";
    lastPacks = [];
    lastExport = null;
    resetPreview();
    downloadContainer.style.display = "none";

    try {
        const pools = await ensureLoaded(mode, code);
        const freshOpts = getOpts();     // set meta may have arrived during loading
        const slots = buildSpec(code, freshOpts, L.statsFromPools(pools));
        renderExplain();

        let bonusPick = null;
        if (opts.includeBonus) {
            status.textContent = `⏳ Loading bonus lands...`;
            bonusPick = await prepareBonus(opts.bonusType);
        }

        const processCard = (card) => {
            if (!card || !opts.guest) return card;
            const guest = pools.spgAll && pools.spgAll.get(L.nameKey(card));
            if (guest && Math.random() < 0.5) {
                const g = guest[Math.floor(Math.random() * guest.length)];
                console.log(`✨ SWAP: Used Special Guest ID ${g.collector_number} for "${card.name}"`);
                return g;
            }
            return card;
        };

        const header = "section,count,name,mana_cost,type,set,set_code,collector_number,lang,rarity,artist,finish,usd_price,eur_price,tix_price,scryfall_uri,scryfall_id";
        const allRows = [];
        const packCsv = [];
        const layoutTag = cmdAny() ? `-${currentLayout().toUpperCase()}Layout` : '';
        const label = mode === 'play' ? 'Booster' : `CommanderBooster${layoutTag}`;
        const allLabel = mode === 'play' ? 'AllBoosters' : `AllCommanderBoosters${layoutTag}`;

        for (let i = 1; i <= packCount; i++) {
            status.textContent = `⏳ Building pack ${i} of ${packCount}...`;
            console.log(`--- Generating Pack ${i} ---`);
            const packRows = [];
            const packCards = [];   // kept for the preview (no extra requests)
            const usedNames = new Set();
            for (const slot of slots) {
                for (let k = 0; k < slot.n; k++) {
                    const outcome = L.chooseOutcome(slot.outcomes, Math.random);
                    if (!outcome) continue;
                    const drawn = await drawCard(outcome, pools, usedNames);
                    if (drawn && !/Basic/.test(drawn.type_line || '')) usedNames.add(L.nameKey(drawn));
                    const card = processCard(drawn);
                    if (!card) continue;
                    const finish = L.finishFor(outcome, Math.random);
                    packRows.push(formatToFullCSV(card, finish));
                    packCards.push({ card, finish, slot: slot.from + k, label: outcome.label });
                }
            }
            if (bonusPick) {
                const b = bonusPick();
                if (b.card) {
                    packRows.push(formatToFullCSV(b.card, "nonfoil", b.section));
                    packCards.push({ card: b.card, finish: "nonfoil", slot: null, label: "Bonus land", bonus: true });
                }
            }
            lastPacks.push(packCards);
            allRows.push(...packRows);
            packCsv.push([header, ...packRows].join("\n"));
        }

        lastExport = {
            base: [`${setCode}-${allLabel}-${packCount}`].concat(packCsv.map((_, i) => `${setCode}-${label}-${i + 1}`)),
            csv: [[header, ...allRows].join("\n")].concat(packCsv)
        };
        renderDownloadRows();

        $('previewPackSelect').innerHTML = lastPacks.map((p, idx) => `<option value="${idx}">Pack ${idx + 1} (${p.length} cards)${dfcCount(p) ? ` ⟲ ${dfcCount(p)} double-faced` : ''}</option>`).join('');
        if (!$('previewPanel').classList.contains('hidden')) renderPreview(0);
        const dfcPacks = lastPacks.filter(p => dfcCount(p)).length;
        status.textContent = `✅ Successfully generated ${packCount} ${mode === 'play' ? 'play' : 'commander'} boosters${opts.vanilla ? ' (vanilla)' : ''}.`
            + (dfcPacks ? ` ⟲ ${dfcPacks} pack${dfcPacks === 1 ? '' : 's'} contain double-faced cards; check the "Double-faced cards" print setting.` : '');
        downloadContainer.style.display = "block";
    } catch (e) { status.textContent = "❌ Error: " + e.message; console.error(e); }
    finally { genBtn.disabled = false; }
});
