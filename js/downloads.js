/*
 * downloads.js
 * ------------
 * Downloads table: CSV, PDF fronts/backs and MTGProxyPrinter file for all
 * packs or one pack, the double-faced card badges and the custom card back.
 */
"use strict";

// ------------------------------------------------------------------
// Downloads: CSV, PDF and MTGProxyPrinter save file, for all packs or one
// (row 0 = all packs, row n = pack n)
// ------------------------------------------------------------------
let lastExport = null;
let exporting = false;

// Double-faced cards per pack (they need the "Double-faced cards" print choice)
const dfcCount = pack => pack.filter(e => window.Exporter && window.Exporter.isDfc(e.card)).length;
const dfcNames = pack => pack.filter(e => window.Exporter && window.Exporter.isDfc(e.card)).map(e => e.card.name).join(', ');
const dfcBadge = (n, title) => n ? ` <span class="dfc-badge" title="${esc(title)}">⟲ ${n} double-faced</span>` : '';

function renderDownloadRows() {
    const n = lastPacks.length;
    const total = lastPacks.reduce((a, p) => a + dfcCount(p), 0);
    const row = (idx, name) => `<tr class="${idx === 0 ? 'all-row' : ''}${idx > 0 && dfcCount(lastPacks[idx - 1]) ? ' has-dfc' : ''}">
        <td>${name}${idx === 0
            ? dfcBadge(total, `${total} double-faced card(s) across all packs`)
            : dfcBadge(dfcCount(lastPacks[idx - 1]), dfcNames(lastPacks[idx - 1]))}</td>
        <td><a class="dl-btn csv" href="${URL.createObjectURL(new Blob([lastExport.csv[idx]], { type: 'text/csv' }))}" download="${esc(lastExport.base[idx])}.csv">⬇ CSV</a></td>
        <td><button class="dl-btn pdf" data-kind="pdf" data-idx="${idx}">⬇ Fronts</button></td>
        <td><button class="dl-btn back" data-kind="back" data-idx="${idx}">⬇ Backs</button></td>
        <td><button class="dl-btn mpp" data-kind="mpp" data-idx="${idx}">⬇ .mtgproxies</button></td>
    </tr>`;
    $('dlRows').innerHTML = row(0, `All ${n} packs`) + lastPacks.map((p, i) => row(i + 1, `Pack ${i + 1}`)).join('');
}

function saveBytes(bytes, filename, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}

async function exportFile(kind, idx) {
    if (exporting || !lastExport) return;
    exporting = true;
    const buttons = document.querySelectorAll('#dlRows button');
    buttons.forEach(b => b.disabled = true);
    const packs = idx === 0 ? lastPacks : [lastPacks[idx - 1]];
    const what = idx === 0 ? `all ${packs.length} packs` : `pack ${idx}`;
    const newPagePerPack = $('newPagePerPack').checked;
    const st = $('exportStatus');
    try {
        if (kind === 'mpp') {
            st.textContent = `⏳ Building MTGProxyPrinter file for ${what}…`;
            const bytes = await window.Exporter.buildSaveFile(packs, { newPagePerPack, dfcMode: $('dfcMode').value });
            saveBytes(bytes, lastExport.base[idx] + '.mtgproxies', 'application/vnd.sqlite3');
        } else {
            const side = kind === 'back' ? 'back' : 'front';
            if (side === 'back' && $('backImage').value === 'custom' && !customBackUrl) throw new Error('Choose your card back image first.');
            const t0 = Date.now();
            const bytes = await window.Exporter.buildPdf(packs, {
                side,
                dfcMode: $('dfcMode').value,
                flip: $('backFlip').value,
                customBackUrl: side === 'back' && $('backImage').value === 'custom' ? customBackUrl : null,
                paper: $('pdfPaper').value,
                bleedMm: parseFloat($('pdfBleed').value),
                quality: $('pdfQuality').value,
                newPagePerPack,
                title: lastExport.base[idx] + (side === 'back' ? ' (backs)' : ''),
                onProgress: (done, total) => { st.textContent = `⏳ ${side === 'back' ? 'Backs' : 'Fronts'} PDF for ${what}: card images ${done} of ${total}…`; }
            });
            st.textContent = `⏳ Saving PDF…`;
            saveBytes(bytes, lastExport.base[idx] + (side === 'back' ? '-backs' : '') + '.pdf', 'application/pdf');
            console.log(`PDF built in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(bytes.length / 1048576).toFixed(1)} MB`);
        }
        st.textContent = `✅ ${{ pdf: 'Fronts PDF', back: 'Backs PDF', mpp: 'MTGProxyPrinter file' }[kind]} for ${what} downloaded.`;
    } catch (e) {
        console.error(e);
        st.textContent = `❌ Export failed: ${e.message}`;
    } finally {
        exporting = false;
        buttons.forEach(b => b.disabled = false);
    }
}
// Custom card back: kept as a local object URL, never uploaded anywhere
let customBackUrl = null;
$('backImage').addEventListener('change', () => {
    const custom = $('backImage').value === 'custom';
    $('backFile').classList.toggle('hidden', !custom);
    if (custom && !customBackUrl) $('backFile').click();
});
$('backFile').addEventListener('change', () => {
    const f = $('backFile').files[0];
    if (!f) return;
    if (customBackUrl) URL.revokeObjectURL(customBackUrl);
    customBackUrl = URL.createObjectURL(f);
    $('backFileHint').textContent = `Using ${f.name}; it's stretched to 63×88 mm (745×1040 px works best).`;
});

$('dlRows').addEventListener('click', e => {
    const b = e.target.closest('button[data-kind]');
    if (b) exportFile(b.dataset.kind, parseInt(b.dataset.idx, 10));
});
