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
        setSelect.innerHTML = filteredSets.map(s => `<option value="${s.code}">${s.name} (${s.code.toUpperCase()})</option>`).join('');
        // "Any set" commander boosters can use every set, including the official commander ones
        $('cmdAnySetSelect').innerHTML = data.data
            .filter(s => allowedTypes.includes(s.set_type) && s.code.length === 3)
            .sort((a, b) => new Date(b.released_at) - new Date(a.released_at))
            .map(s => `<option value="${s.code}">${s.name} (${s.code.toUpperCase()})</option>`).join('');
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
 'vanillaToggle', 'funMultiplier', 'preferGuestList', 'foilToggle', 'listToggle', 'includeBonus', 'bonusType']
    .forEach(id => $(id).addEventListener('change', refresh));

syncControls();
renderExplain();
initSetList();
