/*
 * preview.js
 * ----------
 * Pack preview: card images for one pack at a time, using image links that
 * are already in the Scryfall card data (no extra API requests).
 */
"use strict";

// ------------------------------------------------------------------
// Pack preview (proof of concept)
// Uses image links already present in the Scryfall card objects, so it costs
// no API calls; images come from the cards.scryfall.io CDN, and only the
// pack being viewed is loaded (lazily).
// ------------------------------------------------------------------
let lastPacks = [];
let previewIndex = 0;

function faceImages(card, size = 'normal') {
    if (card.image_uris) return [card.image_uris[size]];
    if (card.card_faces && card.card_faces.some(f => f.image_uris)) return card.card_faces.filter(f => f.image_uris).map(f => f.image_uris[size]);
    // Built-in bonus lands only carry an id; Scryfall's CDN path is derived from it
    if (card.id) return [`https://cards.scryfall.io/${size}/front/${card.id[0]}/${card.id[1]}/${card.id}.jpg`];
    return [];
}

/*
 * The two sides of one printed card, as {url, name}. That is a double-faced
 * card's own faces, or — for a token separator or a token sheet slot — two
 * different cards, one printed on each side.
 */
function cardSides(entry) {
    const urls = faceImages(entry.card);
    const faceNames = entry.card.card_faces && entry.card.card_faces.length > 1
        ? entry.card.card_faces.filter(f => f.image_uris).map(f => f.name)
        : [];
    const sides = urls.map((url, i) => ({ url, name: faceNames[i] || entry.card.name }));
    if (entry.backCard) {
        const back = faceImages(entry.backCard);
        if (back.length) sides.push({ url: back[0], name: entry.backCard.name });
    }
    return sides;
}

function renderPreview(idx) {
    if (!lastPacks.length) return;
    previewIndex = Math.max(0, Math.min(lastPacks.length - 1, idx));
    $('previewPackSelect').value = String(previewIndex);
    $('prevPack').disabled = previewIndex === 0;
    $('nextPack').disabled = previewIndex === lastPacks.length - 1;
    const grid = $('previewGrid');
    grid.innerHTML = lastPacks[previewIndex].map((e, i) => {
        const sides = cardSides(e);
        const two = sides.length > 1;
        const finish = e.finish !== 'nonfoil' ? ' ' + e.finish : '';
        const badge = e.finish === 'foil' ? 'FOIL' : e.finish === 'etched' ? 'ETCHED' : '';
        const face = (side, cls) => `<div class="pv-img pv-face ${cls}${finish}">
                ${side ? `<img src="${esc(side.url)}" alt="${esc(side.name)}" loading="lazy" decoding="async">` : ''}
                ${badge && cls === 'pv-front' ? `<span class="pv-badge">${badge}</span>` : ''}
            </div>`;
        return `<figure class="pv-card${e.bonus ? ' pv-bonus' : ''}">
            <div class="pv-stage${two ? ' flippable' : ''}" data-i="${i}" data-face="0">
                <div class="pv-flipper">
                    ${face(sides[0], 'pv-front')}
                    ${two ? face(sides[1], 'pv-back') : ''}
                </div>
                ${two ? `<button type="button" class="pv-flip-btn" aria-label="Flip to the other side of this card" title="${esc(sides[1].name)} is on the back — click to flip">⟲</button>` : ''}
            </div>
            <figcaption><b>${e.slot ? 'Slot ' + e.slot : 'Separator'}</b> · ${esc(e.label)}<br>
                <span class="pv-name">${esc(sides[0].name)}</span>${two ? `<span class="pv-side"> · front</span>` : ''}</figcaption>
        </figure>`;
    }).join('');
}

function resetPreview() {
    $('previewGrid').innerHTML = '';
    $('previewPackSelect').innerHTML = '';
}

$('previewToggle').addEventListener('click', () => {
    const panel = $('previewPanel');
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    $('previewToggle').textContent = opening ? '🙈 Hide preview' : '👁 Preview packs';
    if (opening) renderPreview(previewIndex);
});
$('previewPackSelect').addEventListener('change', e => renderPreview(parseInt(e.target.value, 10)));
$('prevPack').addEventListener('click', () => renderPreview(previewIndex - 1));
$('nextPack').addEventListener('click', () => renderPreview(previewIndex + 1));
$('previewGrid').addEventListener('click', e => {
    const stage = e.target.closest('.pv-stage.flippable');
    if (!stage) return;
    const entry = lastPacks[previewIndex][+stage.dataset.i];
    const sides = cardSides(entry);
    const face = (+stage.dataset.face + 1) % 2;
    stage.dataset.face = face;
    stage.classList.toggle('flipped', face === 1);
    // The back of a token slot is a different card, so the caption follows it.
    const cap = stage.closest('.pv-card').querySelector('.pv-name');
    const side = stage.closest('.pv-card').querySelector('.pv-side');
    if (cap && sides[face]) cap.textContent = sides[face].name;
    if (side) side.textContent = face === 1 ? ' · back' : ' · front';
    const btn = stage.querySelector('.pv-flip-btn');
    if (btn && sides[(face + 1) % 2]) btn.title = `${sides[(face + 1) % 2].name} is on the other side — click to flip`;
});
