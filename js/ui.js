/*
 * ui.js
 * -----
 * Form state and the "How each card slot is determined" panel: reading the
 * options, showing/hiding controls per tab, rendering the slot table, and
 * loading a set's pools when the selection changes.
 */
"use strict";

// ------------------------------------------------------------------
// UI state
// ------------------------------------------------------------------
const cmdAny = () => mode === 'commander' && $('cmdSource').value === 'any';
function currentCode() {
    if (mode === 'commander') {
        if (!cmdAny()) return cmdSetSelect.value;
        return ($('cmdAnyCustom').value.trim() || $('cmdAnySetSelect').value || '').toLowerCase();
    }
    return ($('customSet').value.trim() || setSelect.value || '').toLowerCase();
}
// Which commander slot layout to use: the set's own, or the one chosen for "any set"
function currentLayout() {
    if (mode !== 'commander') return null;
    return cmdAny() ? $('cmdLayout').value : cmdSetSelect.value;
}

function getOpts() {
    const vanilla = $('vanillaToggle').checked;
    const code = currentCode();
    const meta = setMeta[code];
    const released = meta ? meta.released_at : null;
    return {
        vanilla,
        mult: vanilla ? 1 : parseInt($('funMultiplier').value, 10),
        guest: !vanilla && $('preferGuestList').checked,
        // play-only fun options never apply to commander boosters
        foilToggle: mode === 'play' && !vanilla && $('foilToggle').checked,
        listToggle: mode === 'play' && !vanilla && $('listToggle').checked,
        listEra: !!released && released >= L.PLAY_BOOSTER_START && released < L.LIST_ERA_END,
        released,
        includeBonus: $('includeBonus').checked,
        bonusType: $('bonusType').value
    };
}

function buildSpec(code, opts, stats) {
    return mode === 'play' ? L.playSpec(opts, stats) : L.commanderSpec(currentLayout(), opts, stats);
}

const isBoosterMode = m => m === 'play' || m === 'commander';
function syncControls() {
    $('boosterUI').classList.toggle('hidden', !isBoosterMode(mode));
    $('simUI').classList.toggle('hidden', isBoosterMode(mode));
    if (!isBoosterMode(mode)) {
        document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        return;
    }
    const vanilla = $('vanillaToggle').checked;
    $('funOptions').disabled = vanilla;
    document.querySelectorAll('.play-only').forEach(el => el.classList.toggle('hidden', mode !== 'play'));
    $('bonusType').disabled = !$('includeBonus').checked;
    $('playSetRow').classList.toggle('hidden', mode !== 'play');
    $('cmdSetRow').classList.toggle('hidden', mode !== 'commander');
    $('cmdOfficialRow').classList.toggle('hidden', cmdAny());
    $('cmdAnyRow').classList.toggle('hidden', !cmdAny());
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('tabBlurb').textContent = mode === 'play'
        ? "14-card Play Boosters from any expansion, core or masters set."
        : "20-card Commander draft boosters: the official sets (Commander Legends, Battle for Baldur's Gate, Commander Masters), or any set built with one of their layouts.";
    $('vanillaHint').textContent = mode === 'play'
        ? "Uses the real Play Booster layout: a basic/common land in the land slot, a non-foil wildcard, a traditional foil wildcard, published rare/mythic and Special Guest odds. Fun options are switched off."
        : (cmdAny()
            ? "Uses the chosen layout's published odds with this set's cards. Fun options (multiplier, Guest List swap) are switched off."
            : "Uses the published Commander draft booster layout for the chosen set. Fun options (multiplier, Guest List swap) are switched off.");
}

// ------------------------------------------------------------------
// Explanation panel
// ------------------------------------------------------------------
const pct = p => p == null ? '' : (p >= 0.9995 ? '100%' : (p * 100 < 0.1 && p > 0 ? '<0.1%' : (p * 100).toFixed(1) + '%'));
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function rarityClass(label) {
    if (/mythic/i.test(label)) return 'r-mythic';
    if (/rare/i.test(label)) return 'r-rare';
    if (/uncommon/i.test(label)) return 'r-uncommon';
    if (/land/i.test(label)) return 'r-land';
    if (/common/i.test(label)) return 'r-common';
    return 'r-special';
}

function foilText(outcomes) {
    let pf = 0, pe = 0, unknown = false;
    outcomes.forEach(o => {
        if (o.p == null) { unknown = true; return; }
        if (o.foil === 'etched') pe += o.p; else pf += o.p * (o.foil || 0);
    });
    if (unknown) {
        const all = outcomes.every(o => o.foil === 1);
        const none = outcomes.every(o => !o.foil);
        return all ? 'Always (traditional foil)' : none ? 'Non-foil' : 'Sometimes';
    }
    const parts = [];
    if (pe > 0) parts.push(`${pct(pe)} foil-etched`);
    if (pf >= 0.9995) parts.push(pe > 0 ? 'otherwise traditional foil' : 'Always (traditional foil)');
    else if (pf > 0) parts.push(`${pct(pf)} traditional foil`);
    return parts.length ? parts.join(' · ') : 'Non-foil';
}

function specialText(outcomes) {
    const tagged = outcomes.filter(o => o.tag);
    if (!tagged.length) return '<span class="muted">—</span>';
    return tagged.map(o => `${esc(o.tag)} ${o.p == null ? '' : '<b>' + pct(o.p) + '</b>'}`).join('<br>');
}

const POOL_NAMES = {
    legC: 'legendary commons', legU: 'legendary uncommons', legR: 'legendary rares', legM: 'legendary mythics',
    legAll: 'any legendary creature/planeswalker', uncommons: 'nonlegendary uncommons', rares: 'nonlegendary rares',
    commons: 'commons', nonBasicLands: 'non-basic lands', landBasics: 'basic lands', landDuals: 'common dual lands', etched: 'foil-etched legends'
};
const FUN_NAMES = { mult: 'multiplier', foilToggle: 'foil toggle', listToggle: 'List toggle', landUpgrade: 'land upgrade' };

// Which of this tab's options are responsible for a slot differing from vanilla
function slotOptionNames(slot, opts) {
    if (opts.vanilla || !slot.affects || !slot.affects.length) return [];
    return slot.affects
        .filter(t => t !== 'foilToggle' || opts.foilToggle)
        .filter(t => t !== 'listToggle' || opts.listToggle)
        .map(t => FUN_NAMES[t]);
}

// The options for this tab with every fun option switched off, so the current
// spec can be compared against the official layout for the same set.
function vanillaOpts(opts) {
    return Object.assign({}, opts, { vanilla: true, mult: 1, guest: false, foilToggle: false, listToggle: false });
}

const foilWord = f => f === 'etched' ? 'foil-etched' : !f ? 'non-foil' : f === 1 ? 'always foil' : pct(f) + ' foil';

// One change record from L.diffFromVanilla as readable HTML
function changeText(c) {
    switch (c.kind) {
        case 'title': return `now <b>${esc(c.toTitle)}</b> <span class="was">(vanilla: ${esc(c.fromTitle)})</span>`;
        case 'added': return `<b>${esc(c.label)}</b> added${c.toP == null ? '' : ' at ' + pct(c.toP)}`;
        case 'removed': return `<b>${esc(c.label)}</b> removed <span class="was">(vanilla ${pct(c.fromP) || 'possible'})</span>`;
        case 'p': return `<b>${esc(c.label)}</b> ${pct(c.fromP)} → ${pct(c.toP)} ${c.toP > c.fromP ? '<span class="up">▲</span>' : '<span class="down">▼</span>'}`;
        case 'foil': return `<b>${esc(c.label)}</b> ${foilWord(c.fromFoil)} → ${foilWord(c.toFoil)}`;
    }
    return '';
}

// Per-row callout naming the responsible options and every concrete change
function changeTag(changes, slot, opts) {
    if (!changes.length) return '';
    const who = slotOptionNames(slot, opts);
    return `<div class="diff-tag"><span class="diff-head">✦ Differs from vanilla${who.length ? ' · ' + esc(who.join(', ')) : ''}</span>`
        + changes.map(c => `<div class="diff-line">${changeText(c)}</div>`).join('')
        + `</div>`;
}

// Expected number of land cards per pack: each outcome picks a card name uniformly
// from its pool, so its land chance is (land names ÷ all names) in that pool
const landShareCache = new WeakMap();
function landShare(map) {
    if (!landShareCache.has(map)) {
        let n = 0;
        for (const variants of map.values()) if (/\bLand\b/.test(variants[0].type_line || '')) n++;
        landShareCache.set(map, map.size ? n / map.size : 0);
    }
    return landShareCache.get(map);
}
function expectedLands(slots, pools) {
    if (!pools) return null;
    let total = 0;
    for (const s of slots) for (const o of s.outcomes) {
        if (o.p == null || o.pool === 'LIST') continue;
        const map = L.resolvePool(pools, o.pool);
        if (map) total += s.n * o.p * landShare(map);
    }
    return total;
}

function renderExplain() {
    const code = currentCode();
    const opts = getOpts();
    const key = mode + ':' + code;
    const pools = loadedPools[key];
    const stats = pools ? L.statsFromPools(pools) : null;
    const slots = buildSpec(code, opts, stats);
    // Same set, same card counts, official odds: anything that differs is down
    // to the options chosen on this tab.
    const diffs = L.diffFromVanilla(slots, opts.vanilla ? null : buildSpec(code, vanillaOpts(opts), stats));
    const diffCount = diffs.reduce((a, c) => a + c.length, 0);

    const layoutTxt = mode === 'commander' && cmdAny() ? ` · ${L.LAYOUTS[currentLayout()]}` : '';
    $('modeBadge').textContent = `— ${mode === 'play' ? 'Play' : 'Commander'} · ${code ? code.toUpperCase() : 'no set'}${layoutTxt} · ${opts.vanilla ? 'Vanilla (official odds)' : 'Fun mode x' + opts.mult}${diffCount ? ` · ${diffCount} change${diffCount === 1 ? '' : 's'} from vanilla` : ''}`;

    const rows = slots.map((s, si) => {
        const changes = diffs[si];
        const slotLabel = s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`;
        const outs = s.outcomes.map(o => {
            const n = stats ? L.poolCount(stats, o.pool) : null;
            const used = L.usedPool(stats, o.pool);
            const fellBack = stats && Array.isArray(o.pool) && used !== o.pool[0];
            const size = n != null && isFinite(n)
                ? ` <span class="muted">(${fellBack ? 'none in set → ' + esc(POOL_NAMES[used] || used) + ', ' : ''}${n} card${n === 1 ? '' : 's'})</span>` : '';
            const formula = o.formula ? `<div class="muted" style="margin-left:52px">${esc(o.formula)}</div>` : '';
            return `<div class="oc"><b>${o.p == null ? '?' : pct(o.p)}</b><span class="rar ${rarityClass(o.label)}">${esc(o.label)}</span>${size}</div>${o.p == null || (o.p > 0 && o.p < 1) ? formula : ''}`;
        }).join('');
        return `<tr${changes.length ? ' class="changed"' : ''}>
            <td class="slotnum">${slotLabel}${s.n > 1 ? `<div class="muted">${s.n} cards</div>` : ''}</td>
            <td><strong>${esc(s.title)}</strong><div class="muted">${esc(s.types)}</div>${changeTag(changes, s, opts)}</td>
            <td>${outs || '<span class="muted">No cards available</span>'}</td>
            <td>${foilText(s.outcomes)}</td>
            <td>${specialText(s.outcomes)}</td>
        </tr>`;
    }).join('');

    const total = slots.reduce((a, s) => a + s.n, 0);
    let expectHtml = '';
    if (stats) {
        const exp = L.expectedCounts(slots);
        const sum = re => Object.entries(exp).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
        const chips = [
            ['Rares + mythics', sum(/rare|mythic/i)],
            ['Mythics', sum(/mythic/i)],
            ['Foils', exp.__foil || 0]
        ];
        if (mode === 'commander') chips.push(['Legendaries', sum(/legend|background/i)]);
        const lands = expectedLands(slots, pools);
        if (lands != null) chips.push([opts.includeBonus ? 'Lands (+1 separator)' : 'Lands', lands]);
        const sg = sum(/special guest|the list|piper/i);
        if (sg > 0) chips.push([mode === 'play' ? 'List / Special Guest' : 'Prismatic Piper', sg]);
        expectHtml = `<div class="expect">${chips.map(([k, v]) => `<span>${k}: <b>${v.toFixed(2)}</b> per pack</span>`).join('')}</div>`;
    }

    // Summary of everything that deviates from the official layout
    let diffHtml = '';
    if (!opts.vanilla) {
        const items = slots.map((s, i) => diffs[i].length
            ? `<li><b>Slot ${s.from === s.to ? s.from : s.from + '–' + s.to}</b> (${esc(s.title)}): ${diffs[i].map(changeText).join('; ')}</li>`
            : '').filter(Boolean);
        // The Guest List swap changes which printing is used after a card is
        // drawn, so it never shows up as a change to a slot's odds.
        const guestItem = opts.guest
            ? `<li><b>Every slot:</b> a drawn card that has a Special Guests printing is swapped to it 50% of the time — this changes the printing, not which card fills the slot, so none of the chances above move.</li>`
            : '';
        // Fun mode rebuilds the tail of a Play Booster in a different order, so
        // a row is compared with whatever vanilla puts at the same card position.
        const reordered = diffs.some(cs => cs.some(c => c.kind === 'title'))
            ? `<p class="muted reorder-note">Fun mode changes what some positions hold, so each row is compared with the vanilla slot at the same card position — not with a slot of the same name.</p>`
            : '';
        if (items.length || guestItem) {
            diffHtml = `<div class="vanilla-diff"><b>✦ ${diffCount || 'No'} change${diffCount === 1 ? '' : 's'} from vanilla</b>`
                + `<span class="muted"> — highlighted in the table below</span><ul>${items.join('')}${guestItem}</ul>${reordered}</div>`;
        } else {
            diffHtml = `<div class="vanilla-diff same"><b>✓ No differences from vanilla</b><span class="muted"> — the options chosen leave every slot at its official odds for this set.</span></div>`;
        }
    }

    // Options in effect for THIS tab, and which slots each one changes
    const slotList = tag => slots.filter(s => (s.affects || []).includes(tag)).map(s => s.from === s.to ? s.from : `${s.from}–${s.to}`).join(', ');
    const mods = [];
    if (mode === 'commander' && cmdAny()) {
        const lay = currentLayout();
        const legs = stats ? `${stats.legC || 0} common, ${stats.legU || 0} uncommon, ${stats.legR || 0} rare and ${stats.legM || 0} mythic legendary creatures/planeswalkers` : 'its legendary creatures/planeswalkers';
        mods.push(`<b>Commander booster from any set:</b> ${esc(L.LAYOUTS[lay])} filled with ${esc(code.toUpperCase())} cards: ${legs}${stats && (stats.bgCU || stats.bgR) ? `, ${(stats.bgCU || 0) + (stats.bgR || 0)} Backgrounds` : ''}.`
            + (stats && (stats.legAll || 0) < 10 ? ' <b>This set has very few legends</b>, so legendary slots repeat often or fall back to nonlegendary cards.' : ''));
    }
    if (opts.vanilla) {
        mods.push('<b>Vanilla:</b> on. Official odds for every slot; this tab\'s fun options are switched off.');
    } else {
        mods.push(opts.mult > 1
            ? `<b>Fun multiplier x${opts.mult}</b> (slot${slotList('mult').includes(',') ? 's' : ''} ${slotList('mult')}): upgrade chances are multiplied and capped at 100%${mode === 'play' ? ' (Special Guest/List, mythic)' : ' (legendary rare/mythic, rare Background, mythic, rare in the uncommon-or-rare slot, foil-etched)'}; commons are removed from ${mode === 'play' ? 'the wildcards' : 'the foil slot'}.`
            : `<b>Fun multiplier x1:</b> standard odds (would affect slots ${slotList('mult')}).`);
        if (opts.guest) mods.push(`<b>Guest List swap</b> (slots 1–${total}): after a card is drawn, if it has a Special Guests printing it is swapped to that printing 50% of the time.`);
        if (mode === 'play') {
            if (opts.foilToggle) mods.push(`<b>Foil wildcard</b> (slot ${slotList('foilToggle')}): the second wildcard is always traditional foil.`);
            if (opts.listToggle) mods.push(`<b>The List</b> (slot ${slotList('listToggle')}): 12.5% × multiplier chance of a random card from The List.`);
            mods.push(`<b>Land upgrade</b> (slot ${slotList('landUpgrade')}): fun mode always swaps the basic land for a random non-basic land from the set.`);
        }
    }
    mods.push('<b>Printing:</b> a card name is chosen uniformly from the slot\'s pool, then one of that card\'s printings in the set (regular, showcase, borderless, etc.) is chosen at random.');
    if (opts.includeBonus) {
        const cyc = L.LAND_CYCLES.find(c => c.id === opts.bonusType);
        const names = cyc && cyc.names ? `: ${cyc.names.join(', ')}` : (cyc && cyc.builtIn ? ': 10 original duals + 10 fetch lands' : '');
        mods.push(`<b>Bonus land (card ${total + 1}):</b> after each pack, one random ${esc(cyc ? cyc.label : '')}${esc(names)}. It marks the pack boundary and is not part of the pack.`);
    }
    if (mode === 'play' && opts.released && opts.released < L.PLAY_BOOSTER_START) {
        mods.push(`<b>Note:</b> this set (released ${opts.released}) predates Play Boosters, so it is simulated with the modern Play Booster layout rather than its original draft/set booster.`);
    }
    if (mode === 'play' && opts.vanilla) {
        mods.push(opts.listEra
            ? '<b>The List:</b> this set is from the MKM–Bloomburrow era, when 12.5% of Play Boosters had a List card (Special Guests included) in slot 7.'
            : '<b>The List:</b> not in Play Boosters for this set; slot 7 only upgrades to a Special Guest (1 in 64).');
    }
    mods.push('<b>Approximate:</b> foil-slot rarity uses per-card weights of 4 : 2 : 1 : ½ (common : uncommon : rare : mythic), close to Duskmourn\'s published foil sheet. Wildcard split (18% / 67% / 15%) also comes from the Duskmourn sheet.');

    $('explainBody').innerHTML = `
        ${stats ? '' : `<p class="muted">${code ? 'Loading card counts for ' + esc(code.toUpperCase()) + '… percentages that depend on the set show a formula until then.' : 'Pick a set to see exact percentages.'}</p>`}
        ${diffHtml}
        <div class="table-wrap"><table class="slots">
            <thead><tr><th>Slot</th><th>Card types</th><th>Possible cards &amp; chance</th><th>Foil</th><th>List / Special</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${expectHtml}
        <ul class="modifiers">${mods.map(m => `<li>${m}</li>`).join('')}</ul>
        <p class="sources">Pack layouts: Wizards' <a href="https://magic.wizards.com/en/news/feature/collecting-commander-masters" target="_blank" rel="noopener">Collecting Commander Masters</a>,
        StarCityGames' <a href="https://articles.starcitygames.com/magic-the-gathering/your-guide-to-commander-legends-battle-for-baldurs-gate-products/" target="_blank" rel="noopener">Baldur's Gate product guide</a>,
        and the booster data on <a href="https://www.mtg.wtf/pack/cmr-draft" target="_blank" rel="noopener">mtg.wtf</a> (CMR, CMM, MKM and DSK Play Boosters).</p>`;
}

let loadTimer = null;
function refresh() {
    syncControls();
    if (!isBoosterMode(mode)) { window.Sims && window.Sims.show(mode); return; }
    renderExplain();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(async () => {
        const code = currentCode();
        if (!code) return;
        const m = mode;
        const key = m + ':' + code;
        if (loadedPools[key]) { showSetInfo(m, code); return; }
        $('setInfo').textContent = `⏳ Loading ${code.toUpperCase()} card pools…`;
        try {
            await ensureLoaded(m, code);
            if (mode === m && currentCode() === code) { showSetInfo(m, code); renderExplain(); }
        } catch (e) {
            if (mode === m && currentCode() === code) $('setInfo').textContent = '❌ ' + e.message;
        }
    }, 350);
}

function showSetInfo(m, code) {
    const p = loadedPools[m + ':' + code];
    if (!p) return;
    const meta = setMeta[code] || L.COMMANDER_SETS[code];
    const name = meta ? meta.name : code.toUpperCase();
    const rel = meta ? (meta.released_at || meta.released || '') : '';
    const c = k => (p[k] ? p[k].size : 0);
    const counts = m === 'play'
        ? `${c('commons')} commons · ${c('uncommons')} uncommons · ${c('rares')} rares · ${c('mythics')} mythics · ${c('nonBasicLands')} non-basic lands`
        : `${c('commons')} C · ${c('uncommons')} U · ${c('rares')} R · ${c('mythics')} M in regular slots · ${c('legAll')} legends (${c('legC')} C · ${c('legU')} U · ${c('legR')} R · ${c('legM')} M)` + (c('bgCU') + c('bgR') ? ` · ${c('bgCU') + c('bgR')} backgrounds` : '');
    $('setInfo').textContent = `✅ ${name}${rel ? ' (' + rel + ')' : ''}: ${counts} (unique card names)`;
}
