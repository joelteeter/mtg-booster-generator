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

function renderPreview(idx) {
    if (!lastPacks.length) return;
    previewIndex = Math.max(0, Math.min(lastPacks.length - 1, idx));
    $('previewPackSelect').value = String(previewIndex);
    $('prevPack').disabled = previewIndex === 0;
    $('nextPack').disabled = previewIndex === lastPacks.length - 1;
    const grid = $('previewGrid');
    grid.innerHTML = lastPacks[previewIndex].map((e, i) => {
        const imgs = faceImages(e.card);
        const badge = e.finish === 'foil' ? 'FOIL' : e.finish === 'etched' ? 'ETCHED' : (imgs.length > 1 ? '⟲ FLIP' : '');
        return `<figure class="pv-card${e.bonus ? ' pv-bonus' : ''}">
            <div class="pv-img${e.finish !== 'nonfoil' ? ' ' + e.finish : ''}${imgs.length > 1 ? ' flippable' : ''}" data-i="${i}" data-face="0">
                ${imgs.length ? `<img src="${esc(imgs[0])}" alt="${esc(e.card.name)}" loading="lazy" decoding="async">` : ''}
                ${badge ? `<span class="pv-badge">${badge}</span>` : ''}
            </div>
            <figcaption><b>${e.slot ? 'Slot ' + e.slot : 'Separator'}</b> · ${esc(e.label)}<br>${esc(e.card.name)}</figcaption>
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
    const box = e.target.closest('.pv-img.flippable');
    if (!box) return;
    const entry = lastPacks[previewIndex][+box.dataset.i];
    const imgs = faceImages(entry.card);
    const face = (+box.dataset.face + 1) % imgs.length;
    box.dataset.face = face;
    box.querySelector('img').src = imgs[face];
});
