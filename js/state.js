/*
 * state.js
 * --------
 * Shared app state: DOM shortcuts, the current tab, per-tab option memory
 * and the caches of loaded card pools. Loaded first; every other script uses these.
 */
"use strict";

const L = window.BoosterLogic;
const $ = id => document.getElementById(id);
const genBtn = $('genBtn');
const status = $('status');
const downloadContainer = $('downloadContainer');
const setSelect = $('setSelect');
const cmdSetSelect = $('cmdSetSelect');

let mode = 'play';
// Every option is remembered separately for each tab, so a setting chosen
// for Play Boosters never leaks into Commander boosters (and vice versa).
const OPT_IDS = ['packCount', 'vanillaToggle', 'funMultiplier', 'preferGuestList', 'foilToggle', 'listToggle', 'includeBonus', 'bonusType'];
const modeState = {};
function readControls() {
    const o = {};
    OPT_IDS.forEach(id => { const el = $(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
}
function writeControls(o) {
    OPT_IDS.forEach(id => { const el = $(id); if (el.type === 'checkbox') el.checked = o[id]; else el.value = o[id]; });
}
const setMeta = {};          // code -> Scryfall set object
const poolCache = {};        // "mode:code" -> Promise<pools>
const loadedPools = {};      // "mode:code" -> pools (once resolved)
