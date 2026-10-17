/*
 * export.js
 * ---------
 * Turns generated packs into print-ready files, keeping the exact card order:
 *
 *   • MTGProxyPrinter save file (.mtgproxies) – an SQLite database in
 *     MTGProxyPrinter's "document-v7" format, built in the browser with sql.js.
 *     Opening it in MTGProxyPrinter keeps every card in the page/slot we wrote,
 *     unlike its CSV import, which merges duplicate cards.
 *   • PDF – US Letter or A4, 3×3 cards at 63×88 mm (745×1040 px at 300 dpi),
 *     edge-to-edge cut lines, like MTGProxyPrinter's own PDF export. Upgrade:
 *     each card's rounded corners are filled from the pixels next to them, and the
 *     card's edge pixels are stretched past the
 *     outer edges of the card grid as bleed, so a slightly-off cut doesn't leave
 *     a white strip.
 *
 * The save-file schema below is MTGProxyPrinter's document-v7.sql
 * (Copyright © 2020-2026 Thomas Hess, GPL-3.0-or-later), used unchanged so the
 * file passes MTGProxyPrinter's schema check.
 *
 * A matching backs PDF mirrors the layout so each back prints behind its front
 * (standard Magic back, a custom image, or a double-faced card's back face).
 *
 * Packs are passed in as arrays of entries: { card, finish, bonus }.
 */
(function (root) {
    "use strict";

    const CDN = {
        sqlDir: "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/",
        pdfLib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
        // Optional AI upscaling (UpscalerJS, MIT; ESRGAN "medium" 2× model, ~2.7 MB, fetched
        // from jsDelivr by the library itself). TensorFlow.js 4.11 is the version UpscalerJS 1.0 targets.
        tfjs: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js",
        upscaler: "https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js",
        esrgan2x: "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-medium@1.0.0/dist/umd/models/esrgan-medium/src/x2/index.min.js"
    };

    const SCHEMA_V7 = `PRAGMA user_version = 7;
PRAGMA application_id = 41325044; -- ASCII-encoded "MTGP"
PRAGMA page_size =  512;
VACUUM;  -- Required to apply setting PRAGMA page_size
CREATE TABLE CustomCardData (
  -- Holds custom cards. The original file path is not retained.
  -- The path may contain sensitive information and is not portable.
  card_id TEXT NOT NULL PRIMARY KEY CHECK (card_id GLOB '[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]'),
  image BLOB NOT NULL,  -- The raw image content
  name TEXT NOT NULL DEFAULT '',
  set_name TEXT NOT NULL DEFAULT '',
  set_code TEXT NOT NULL DEFAULT '',
  collector_number TEXT NOT NULL DEFAULT '',
  is_front BOOLEAN_INTEGER NOT NULL CHECK (is_front IN (TRUE, FALSE)) DEFAULT TRUE,
  other_face TEXT REFERENCES CustomCardData(card_id)  -- If this is a DFC, this references the other side
);
CREATE TABLE Page (
  page INTEGER NOT NULL PRIMARY KEY CHECK (page > 0),
  image_size TEXT NOT NULL CHECK(image_size <> '')
);
CREATE TABLE Card (
  page INTEGER NOT NULL CHECK (page > 0) REFERENCES Page(page),
  slot INTEGER NOT NULL CHECK (slot > 0),
  is_front BOOLEAN_INTEGER NOT NULL CHECK (is_front IN (TRUE, FALSE)),
  type TEXT NOT NULL CHECK (type <> ''),
  scryfall_id TEXT CHECK (scryfall_id GLOB '[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]'),
  custom_card_id TEXT REFERENCES CustomCardData(card_id) DEFAULT NULL,
  PRIMARY KEY(page, slot),
  CONSTRAINT "Card slot must not refer to both an official and custom card" CHECK ((scryfall_id IS NULL) OR (custom_card_id IS NULL))
) WITHOUT ROWID;
CREATE TABLE DocumentSettings (
  -- Non-numerical document settings
  "key" TEXT NOT NULL PRIMARY KEY CHECK (typeof("key") == 'text' and "key" <> ''),
  value TEXT NOT NULL CHECK (typeof(value) == 'text')
) WITHOUT ROWID;
CREATE TABLE DocumentDimensions (
  -- Numerical document settings. Values are stored as texts including units, for example '12 mm'
  -- Type contains Quantity, which is used to register an automatic conversion method to pint.Quantity
  "key" TEXT NOT NULL PRIMARY KEY CHECK (typeof("key") == 'text' and "key" <> ''),
  value TEXT_QUANTITY NOT NULL CHECK (typeof(value) == 'text' and value <> '')
) WITHOUT ROWID;`;

    // Card image size MTGProxyPrinter uses (Scryfall PNG size), at 300 dpi
    const CARD_PX = { w: 745, h: 1040 };
    const PT_PER_PX = 72 / 300;
    const CARD_PT = { w: CARD_PX.w * PT_PER_PX, h: CARD_PX.h * PT_PER_PX };   // 178.8 × 249.6 pt
    const PAPER = {
        letter: { w: 612, h: 792, label: "US Letter" },
        a4: { w: 595.28, h: 841.89, label: "A4" }
    };
    const GRID = { cols: 3, rows: 3 };
    const PER_PAGE = GRID.cols * GRID.rows;
    const MM = 72 / 25.4;

    // ------------------------------------------------------------------
    // Library loading (only when an export is first requested)
    // ------------------------------------------------------------------
    const scriptPromises = {};
    function loadScript(src) {
        if (!scriptPromises[src]) {
            scriptPromises[src] = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = src;
                s.onload = resolve;
                s.onerror = () => { delete scriptPromises[src]; reject(new Error("Could not load " + src)); };
                document.head.appendChild(s);
            });
        }
        return scriptPromises[src];
    }
    let sqlPromise = null;
    function getSql() {
        if (root.__SQL_FOR_TESTS) return Promise.resolve(root.__SQL_FOR_TESTS);
        if (!sqlPromise) {
            sqlPromise = loadScript(CDN.sqlDir + "sql-wasm.js")
                .then(() => root.initSqlJs({ locateFile: f => CDN.sqlDir + f }))
                .catch(e => { sqlPromise = null; throw e; });
        }
        return sqlPromise;
    }
    // ------------------------------------------------------------------
    // Optional 2× AI upscaling (runs on the graphics card through WebGL)
    // ------------------------------------------------------------------
    const UPSCALE = { patchSize: 128, padding: 8 };   // small tiles were by far the fastest in testing
    let upscalerPromise = null;
    function getUpscaler() {
        if (!upscalerPromise) {
            upscalerPromise = (async () => {
                await loadScript(CDN.tfjs);
                await loadScript(CDN.upscaler);
                await loadScript(CDN.esrgan2x);
                await root.tf.ready();
                const up = new root.Upscaler({ model: root.ESRGANMedium2x });
                await up.warmup([UPSCALE]);      // compiles the model for this GPU once
                return up;
            })().catch(e => { upscalerPromise = null; throw new Error("Couldn't start the AI upscaler: " + e.message); });
        }
        return upscalerPromise;
    }

    // One image at a time: the GPU does the work, so running several at once only adds memory
    let upscaleQueue = Promise.resolve();
    function upscaleCanvas(canvas) {
        const job = upscaleQueue.then(async () => {
            const up = await getUpscaler();
            const tf = root.tf;
            const out = await up.upscale(canvas, Object.assign({ output: "tensor" }, UPSCALE));
            const pixels = tf.tidy(() => out.clipByValue(0, 255).cast("int32"));
            out.dispose();
            const result = document.createElement("canvas");
            result.width = pixels.shape[1];
            result.height = pixels.shape[0];
            await tf.browser.toPixels(pixels, result);
            pixels.dispose();
            return result;
        });
        upscaleQueue = job.catch(() => {});
        return job;
    }

    async function getPdfLib() {
        if (root.PDFLib) return root.PDFLib;
        await loadScript(CDN.pdfLib);
        return root.PDFLib;
    }

    // ------------------------------------------------------------------
    // Page layout shared by both exports
    // ------------------------------------------------------------------
    function layoutPages(packs, newPagePerPack, perPage = PER_PAGE) {
        const pages = [];
        let cur = [];
        packs.forEach(pack => {
            if (newPagePerPack && cur.length) { pages.push(cur); cur = []; }
            pack.forEach(entry => {
                cur.push(entry);
                if (cur.length === perPage) { pages.push(cur); cur = []; }
            });
        });
        if (cur.length) pages.push(cur);
        return pages;
    }

    // ------------------------------------------------------------------
    // Double-faced cards
    // dfcMode "separate":  the back face gets its own slot right after the front
    //                      (fronts PDF / save file), e.g. for sleeving
    // dfcMode "frontOnly": only the front is placed; the backs PDF prints the
    //                      back face behind it, for double-sided printing
    // ------------------------------------------------------------------
    const isDfc = card => !!(card && !card.image_uris && card.card_faces && card.card_faces.length > 1
        && card.card_faces[0].image_uris && card.card_faces[1].image_uris);

    function expandFaces(packs, dfcMode) {
        return packs.map(pack => pack.flatMap(entry => {
            const front = Object.assign({}, entry, { face: 0 });
            return dfcMode === "separate" && isDfc(entry.card) ? [front, Object.assign({}, entry, { face: 1 })] : [front];
        }));
    }

    // ------------------------------------------------------------------
    // MTGProxyPrinter save file
    // ------------------------------------------------------------------
    async function buildSaveFile(packs, opts = {}) {
        const SQL = await getSql();
        const db = new SQL.Database();
        try {
            db.exec(SCHEMA_V7);
            const pages = layoutPages(expandFaces(packs, opts.dfcMode || "separate"), !!opts.newPagePerPack, opts.perPage || PER_PAGE);
            const addPage = db.prepare("INSERT INTO Page (page, image_size) VALUES (?, ?)");
            const addCard = db.prepare("INSERT INTO Card (page, slot, is_front, type, scryfall_id) VALUES (?, ?, ?, 'r', ?)");
            db.exec("BEGIN");
            pages.forEach((page, p) => {
                addPage.run([p + 1, `${CARD_PX.w}x${CARD_PX.h}`]);
                page.forEach((entry, s) => {
                    const id = String(entry.card.id || "").toLowerCase();
                    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
                        throw new Error(`"${entry.card.name}" has no Scryfall ID, so MTGProxyPrinter can't look it up`);
                    }
                    addCard.run([p + 1, s + 1, entry.face === 1 ? 0 : 1, id]);
                });
            });
            db.exec("COMMIT");
            addPage.free();
            addCard.free();
            return db.export();
        } finally {
            db.close();
        }
    }

    // ------------------------------------------------------------------
    // Card images → JPEG at 745×1040 (+ bleed) with the rounded corners filled
    // ------------------------------------------------------------------
    function imageUrl(card, quality, face = 0) {
        const size = quality === "fast" ? "large" : "png";
        const ext = size === "png" ? "png" : "jpg";
        const uris = face === 1
            ? (card.card_faces && card.card_faces[1] && card.card_faces[1].image_uris)
            : (card.image_uris || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris));
        if (uris && uris[size]) return uris[size];
        if (card.id) return `https://cards.scryfall.io/${size}/${face === 1 ? "back" : "front"}/${card.id[0]}/${card.id[1]}/${card.id}.${ext}`;
        return null;
    }

    // Always the standard Magic card back (one image for every card), never a card's
    // special back such as the 30th Anniversary Edition one
    const STANDARD_BACK_ID = "0aeebaf5-8c7d-4636-9e82-8c27447861f7";
    function cardBackUrl(card, quality) {
        const id = STANDARD_BACK_ID;
        const size = quality === "fast" ? "large" : "png";
        return `https://backs.scryfall.io/${size}/${id[0]}/${id[1]}/${id}.${size === "png" ? "png" : "jpg"}`;
    }

    const imageCache = new Map();   // "url|bleedPx|enhance" → Promise<{ bytes, bleedPx }>

    /*
     * Downloads a card image and returns it as a JPEG, B pixels larger on every side:
     *   • each transparent rounded corner is filled with the colour just inside that
     *     corner (so a full-art card's corner continues its art, not a grey average)
     *   • the B-pixel bleed repeats the card's outermost row/column of pixels outward,
     *     the way MTGProxyPrinter's own bleed works
     * The PDF then clips the bleed away on sides that touch a neighbouring card.
     * With enhance, the card is AI-upscaled 2× (1490×2080, ~600 dpi) after the corners
     * are filled; bleedPx stays in 300 dpi units so the PDF layout is unchanged.
     */
    async function preparedCard(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Image download failed (${res.status})`);
        const bmp = await createImageBitmap(await res.blob());
        const W = CARD_PX.w, H = CARD_PX.h;

        // Card at 745×1040 with filled corners
        const card = document.createElement("canvas");
        card.width = W; card.height = H;
        const c = card.getContext("2d", { willReadFrequently: true });
        c.drawImage(bmp, 0, 0, W, H);
        if (bmp.close) bmp.close();
        const R = 42;   // a little more than the corner radius (~35 px)
        const corners = [[0, 0, 14, 14], [W - R, 0, W - 22, 14], [0, H - R, 14, H - 22], [W - R, H - R, W - 22, H - 22]];
        c.globalCompositeOperation = "destination-over";      // paint only where the card is transparent
        for (const [x, y, sx, sy] of corners) {
            c.fillStyle = averageColour(c, sx, sy, 8, 8);
            c.fillRect(x, y, R, R);
        }
        c.globalCompositeOperation = "source-over";
        return card;
    }

    async function browserImageLoader(url, bleedPx = 0, enhance = false) {
        let card = await preparedCard(url);
        let scale = 1;
        if (enhance) { card = await upscaleCanvas(card); scale = 2; }
        const W = card.width, H = card.height, B = Math.max(0, Math.round(bleedPx)) * scale;

        // Extend by B pixels on every side by stretching the edge pixels
        let out = card;
        if (B > 0) {
            out = document.createElement("canvas");
            out.width = W + 2 * B; out.height = H + 2 * B;
            const o = out.getContext("2d");
            o.imageSmoothingEnabled = false;
            o.drawImage(card, B, B);
            o.drawImage(card, 0, 0, 1, H, 0, B, B, H);              // left
            o.drawImage(card, W - 1, 0, 1, H, W + B, B, B, H);      // right
            o.drawImage(card, 0, 0, W, 1, B, 0, W, B);              // top
            o.drawImage(card, 0, H - 1, W, 1, B, H + B, W, B);      // bottom
            o.drawImage(card, 0, 0, 1, 1, 0, 0, B, B);              // corners
            o.drawImage(card, W - 1, 0, 1, 1, W + B, 0, B, B);
            o.drawImage(card, 0, H - 1, 1, 1, 0, H + B, B, B);
            o.drawImage(card, W - 1, H - 1, 1, 1, W + B, H + B, B, B);
        }
        const blob = await new Promise(r => out.toBlob(r, "image/jpeg", 0.92));
        return { bytes: new Uint8Array(await blob.arrayBuffer()), bleedPx: B / scale };
    }

    function averageColour(ctx, x, y, w, h) {
        const d = ctx.getImageData(x, y, w, h).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : "rgb(0,0,0)";
    }

    async function mapLimit(items, limit, fn) {
        const out = new Array(items.length);
        let next = 0;
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i], i);
            }
        });
        await Promise.all(workers);
        return out;
    }

    // ------------------------------------------------------------------
    // PDF
    // opts: { side: 'front'|'back', paper: 'letter'|'a4', bleedMm, newPagePerPack,
    //         quality: 'high'|'fast', enhance (2× AI upscale), dfcMode: 'separate'|'frontOnly',
    //         flip: 'long'|'short' (backs only), customBackUrl (backs only),
    //         cutLines (default: on, except fronts in "frontOnly" mode),
    //         onProgress(done, total), imageLoader(url) }
    //
    // The backs PDF uses exactly the same page layout as the fronts PDF, with
    // positions mirrored so each back lands behind its front when printed
    // double-sided: flipping on the long edge mirrors left↔right (column 1
    // front ↔ column 3 back); flipping on the short edge mirrors top↔bottom.
    // ------------------------------------------------------------------
    function placementsFor(cards, opts) {
        const back = opts.side === "back";
        return cards.map((entry, i) => {
            let col = i % GRID.cols, row = Math.floor(i / GRID.cols);
            let url;
            if (!back) {
                url = imageUrl(entry.card, opts.quality, entry.face || 0);
            } else {
                if (opts.flip === "short") row = GRID.rows - 1 - row;
                else col = GRID.cols - 1 - col;
                url = (opts.dfcMode === "frontOnly" && entry.face !== 1 && isDfc(entry.card))
                    ? imageUrl(entry.card, opts.quality, 1)
                    : (opts.customBackUrl || cardBackUrl(entry.card, opts.quality));
            }
            return { col, row, url };
        });
    }

    async function buildPdf(packs, opts = {}) {
        const PDFLib = await getPdfLib();
        const { PDFDocument, rgb, BlendMode, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;
        const paper = PAPER[opts.paper] || PAPER.letter;
        const bleed = Math.max(0, Number(opts.bleedMm) || 0) * MM;
        const bleedPx = Math.round(bleed / PT_PER_PX);
        const loader = opts.imageLoader || browserImageLoader;
        const pages = layoutPages(expandFaces(packs, opts.dfcMode || "separate"), !!opts.newPagePerPack)
            .map(cards => placementsFor(cards, opts));
        // With "front only" the sheet is printed double-sided: cut lines go on the
        // backs only, so they don't show through or print over the card fronts.
        const drawCutLines = opts.cutLines !== undefined
            ? opts.cutLines
            : !(opts.side !== "back" && opts.dfcMode === "frontOnly");

        // Download/convert each distinct image once (cached across exports)
        const urls = [...new Set(pages.flat().map(p => p.url).filter(Boolean))];
        let done = 0;
        const report = () => opts.onProgress && opts.onProgress(done, urls.length);
        report();
        const images = new Map();
        await mapLimit(urls, 6, async url => {
            const key = url + "|" + bleedPx + "|" + (opts.enhance ? "2x" : "1x");
            if (!imageCache.has(key)) {
                imageCache.set(key, loader(url, bleedPx, !!opts.enhance).catch(e => { imageCache.delete(key); throw e; }));
            }
            images.set(url, await imageCache.get(key));
            done++;
            report();
        });

        const pdf = await PDFDocument.create();
        pdf.setTitle(opts.title || "Booster packs");
        pdf.setCreator("MTG Booster Generator");
        const embedded = new Map();
        const x0 = (paper.w - GRID.cols * CARD_PT.w) / 2;
        const yTop = paper.h - (paper.h - GRID.rows * CARD_PT.h) / 2;   // top edge of the grid (PDF origin is bottom-left)
        const cellX = col => x0 + col * CARD_PT.w;
        const cellY = row => yTop - (row + 1) * CARD_PT.h;

        for (const placed of pages) {
            const page = pdf.addPage([paper.w, paper.h]);
            const taken = new Set(placed.map(p => p.row * GRID.cols + p.col));
            const occupied = (c, r) => c >= 0 && c < GRID.cols && r >= 0 && r < GRID.rows && taken.has(r * GRID.cols + c);

            // 0) Cut lines across the whole page, drawn under the cards like MTGProxyPrinter
            if (drawCutLines) {
                const line = { thickness: 0.4, color: rgb(0, 0, 0) };
                for (let c = 0; c <= GRID.cols; c++) {
                    const x = x0 + c * CARD_PT.w;
                    page.drawLine(Object.assign({ start: { x, y: 0 }, end: { x, y: paper.h } }, line));
                }
                for (let r = 0; r <= GRID.rows; r++) {
                    const y = yTop - r * CARD_PT.h;
                    page.drawLine(Object.assign({ start: { x: 0, y }, end: { x: paper.w, y } }, line));
                }
            }

            // 1) Cards. Each image carries its own stretched-edge bleed; it's clipped so the
            //    bleed only shows on sides with no neighbouring card.
            for (const p of placed) {
                const img = images.get(p.url);
                if (!img) continue;
                if (!embedded.has(p.url)) embedded.set(p.url, await pdf.embedJpg(img.bytes));
                const ib = (img.bleedPx || 0) * PT_PER_PX;     // bleed baked into this image, in pt
                const l = occupied(p.col - 1, p.row) ? 0 : Math.min(bleed, ib), r = occupied(p.col + 1, p.row) ? 0 : Math.min(bleed, ib);
                const t = occupied(p.col, p.row - 1) ? 0 : Math.min(bleed, ib), b = occupied(p.col, p.row + 1) ? 0 : Math.min(bleed, ib);
                const x = cellX(p.col), y = cellY(p.row);
                page.pushOperators(pushGraphicsState(), rectangle(x - l, y - b, CARD_PT.w + l + r, CARD_PT.h + t + b), clip(), endPath());
                page.drawImage(embedded.get(p.url), { x: x - ib, y: y - ib, width: CARD_PT.w + 2 * ib, height: CARD_PT.h + 2 * ib });
                page.pushOperators(popGraphicsState());
            }

            // 3) Corner crosshairs on top of the cards. The corners are filled, so the
            //    rounded corners no longer show where cards meet; these mark every card
            //    corner. White in "difference" blend mode inverts what's underneath, so
            //    they show white on black borders and black on white ones.
            if (drawCutLines) {
                const arm = 2.5 * MM;
                const mark = { thickness: 0.6, color: rgb(1, 1, 1), blendMode: BlendMode.Difference };
                const corners = new Set();
                for (const p of placed) for (const dc of [0, 1]) for (const dr of [0, 1]) corners.add(`${p.col + dc},${p.row + dr}`);
                for (const key of corners) {
                    const [c, r] = key.split(",").map(Number);
                    const x = x0 + c * CARD_PT.w, y = yTop - r * CARD_PT.h;
                    page.drawLine(Object.assign({ start: { x: x - arm, y }, end: { x: x + arm, y } }, mark));
                    page.drawLine(Object.assign({ start: { x, y: y - arm }, end: { x, y: y + arm } }, mark));
                }
            }
        }
        return pdf.save();
    }

    // For the "Compare on one card" view: the same card plain-resized to 2× and AI-upscaled
    async function compareEnhance(card, quality) {
        const url = imageUrl(card, quality, 0);
        const base = await preparedCard(url);
        const t0 = performance.now();
        const enhanced = await upscaleCanvas(base);
        const ms = Math.round(performance.now() - t0);
        const plain = document.createElement("canvas");
        plain.width = enhanced.width; plain.height = enhanced.height;
        const p = plain.getContext("2d");
        p.imageSmoothingQuality = "high";
        p.drawImage(base, 0, 0, plain.width, plain.height);
        return { plain, enhanced, ms };
    }

    const api = { compareEnhance, buildSaveFile, buildPdf, layoutPages, expandFaces, isDfc, imageUrl, cardBackUrl, placementsFor, PAPER, CARD_PT, PER_PAGE, SCHEMA_V7 };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.Exporter = api;
})(typeof window !== "undefined" ? window : globalThis);
