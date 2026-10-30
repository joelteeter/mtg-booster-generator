/*
 * main.js
 * -------
 * Start-up: fills the set lists, wires the tabs and option controls, and
 * draws the first slot table. Loaded last.
 */
"use strict";

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
async function initSetList() {
    try {
        const response = await sfFetch(API + "sets");
        const data = await response.json();
        data.data.forEach(s => { setMeta[s.code] = s; });
        const allowedTypes = ['expansion', 'core', 'masters', 'draft_innovation'];
        const commanderCodes = Object.keys(L.COMMANDER_SETS);
        const filteredSets = data.data
            .filter(s => allowedTypes.includes(s.set_type) && s.code.length === 3 && !commanderCodes.includes(s.code))
            .sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
        // Sets that are not out yet are kept, because a partly spoiled set is
        // still worth simulating, but they are grouped and marked so nobody
        // picks one by accident, and the newest released set is the default.
        const today = L.todayISO();
        const option = s => `<option value="${s.code}">${L.isReleased(s, today) ? '' : '\ud83d\udd1c '}${s.name} (${s.code.toUpperCase()})${L.isReleased(s, today) ? '' : ' \u2014 out ' + s.released_at}</option>`;
        const grouped = sets => {
            const upcoming = sets.filter(s => !L.isReleased(s, today));
            const released = sets.filter(s => L.isReleased(s, today));
            return (upcoming.length ? `<optgroup label="\ud83d\udd1c Not released yet">${upcoming.map(option).join('')}</optgroup>` : '')
                 + (released.length ? `<optgroup label="Released">${released.map(option).join('')}</optgroup>` : '');
        };
        // Default to the newest released set, but prefer one built for Limited:
        // the most recent release is often a supplemental or Commander product
        // (Mystery Booster Commander Edition has 1 common and no mythics at
        // all), which would open the app on a pack it cannot sensibly build.
        const DRAFTABLE = ['expansion', 'core'];
        const selectNewestReleased = (el, sets) => {
            const out = sets.filter(s => L.isReleased(s, today));    // newest first
            const pick = out.find(s => DRAFTABLE.includes(s.set_type)) || out[0];
            if (pick) el.value = pick.code;
        };

        setSelect.innerHTML = grouped(filteredSets);
        selectNewestReleased(setSelect, filteredSets);
        // "Any set" commander boosters can use every set, including the official commander ones
        const anySets = data.data
            .filter(s => allowedTypes.includes(s.set_type) && s.code.length === 3)
            .sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
        $('cmdAnySetSelect').innerHTML = grouped(anySets);
        selectNewestReleased($('cmdAnySetSelect'), anySets);
    } catch (e) {
        setSelect.innerHTML = `<option value="">Error loading sets</option>`;
        $('cmdAnySetSelect').innerHTML = `<option value="">Error loading sets</option>`;
        console.error("Set fetch failed:", e);
    }
    refresh();
}

cmdSetSelect.innerHTML = Object.values(L.COMMANDER_SETS)
    .sort((a, b) => b.released.localeCompare(a.released))
    .map(s => `<option value="${s.code}">${s.name} (${s.code.toUpperCase()})</option>`).join('');
$('bonusType').innerHTML = L.LAND_CYCLES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

// Each tab starts from the page defaults and then keeps its own settings
const defaults = readControls();
modeState.play = Object.assign({}, defaults);
modeState.commander = Object.assign({}, defaults);
document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => {
    if (t.dataset.mode === mode) return;
    if (isBoosterMode(mode)) modeState[mode] = readControls();
    mode = t.dataset.mode;
    if (isBoosterMode(mode)) writeControls(modeState[mode]);
    downloadContainer.style.display = "none";
    status.textContent = "Ready";
    refresh();
}));
['setSelect', 'customSet', 'cmdSource', 'cmdSetSelect', 'cmdAnySetSelect', 'cmdAnyCustom', 'cmdLayout',
 'vanillaToggle', 'funMultiplier', 'preferGuestList', 'foilToggle', 'listToggle', 'includeBonus', 'separatorType', 'bonusType', 'tokenSheets']
    .forEach(id => $(id).addEventListener('change', refresh));

syncControls();
renderExplain();
initSetList();
