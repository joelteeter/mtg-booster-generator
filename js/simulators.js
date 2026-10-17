/*
 * simulators.js
 * -------------
 * Planechase and Archenemy simulators. Both tabs share one set of controls in
 * index.html (#simUI) but keep separate decks.
 *
 * Cards come from one paginated Scryfall search per simulator (unique:cards,
 * so one printing per card name), done the first time the tab is opened.
 * Images load from Scryfall's image server, one card at a time.
 *
 * Relies on sfFetch() and API from js/scryfall.js (throttled Scryfall access).
 */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    const SIMS = {
        planechase: {
            query: 'layout:planar game:paper',
            noun: 'plane',
            drawLabel: '🌀 Planeswalk',
            blurb: 'Shuffle every Plane and Phenomenon on Scryfall into one planar deck. Planeswalk to reveal the next plane; the plane you leave goes to the bottom of the deck. Roll the planar die on your turn; each extra roll in the same turn costs one more generic mana.',
            landscape: true
        },
        archenemy: {
            query: 'layout:scheme game:paper',
            noun: 'scheme',
            drawLabel: '😈 Set a scheme in motion',
            blurb: 'Shuffle every Scheme on Scryfall into one scheme deck. Each time you set a scheme in motion, the previous non-ongoing scheme goes to the bottom of the deck. Ongoing schemes stay in play until you abandon them.',
            landscape: false
        }
    };

    // Per-simulator state
    const state = {};
    for (const k in SIMS) state[k] = { pool: null, loading: null, deck: [], current: null, history: [], ongoing: [], rolls: 0, die: null, rotated: false };
    let active = null;

    // ------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------
    async function loadPool(kind) {
        const st = state[kind];
        if (st.pool) return st.pool;
        if (!st.loading) {
            st.loading = (async () => {
                let url = API + 'cards/search?q=' + encodeURIComponent(SIMS[kind].query + ' unique:cards');
                const out = [];
                while (url) {
                    const res = await sfFetch(url);
                    if (!res.ok) throw new Error(`Scryfall API Error: ${res.status}`);
                    const data = await res.json();
                    out.push(...data.data);
                    url = data.has_more ? data.next_page : null;
                }
                st.pool = out;
                return out;
            })().catch(e => { st.loading = null; throw e; });
        }
        return st.loading;
    }

    const isPhenomenon = c => /Phenomenon/.test(c.type_line || '');
    const isOngoing = c => /Ongoing/.test(c.type_line || '');

    function imageOf(card, size) {
        if (card.image_uris) return card.image_uris[size];
        if (card.card_faces && card.card_faces[0].image_uris) return card.card_faces[0].image_uris[size];
        return '';
    }

    function shuffle(arr) {
        // Fisher–Yates, using crypto randomness when available
        const a = arr.slice();
        const rnd = n => {
            if (window.crypto && crypto.getRandomValues) {
                const buf = new Uint32Array(1);
                const limit = Math.floor(0x100000000 / n) * n;
                let x;
                do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
                return x % n;
            }
            return Math.floor(Math.random() * n);
        };
        for (let i = a.length - 1; i > 0; i--) {
            const j = rnd(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------
    function doShuffle() {
        const st = state[active];
        if (!st.pool) return;
        let cards = st.pool;
        if (active === 'planechase' && !$('simPhenomena').checked) cards = cards.filter(c => !isPhenomenon(c));
        st.deck = shuffle(cards);
        st.current = null;
        st.history = [];
        st.ongoing = [];
        st.rolls = 0;
        st.die = null;
        render(`🔀 Shuffled ${st.deck.length} ${SIMS[active].noun}s into a new deck.`);
    }

    function doDraw() {
        const st = state[active];
        if (!st.deck.length && !st.current) return;
        // The card being left goes to the bottom (ongoing schemes stay in play)
        if (st.current && !(active === 'archenemy' && isOngoing(st.current))) st.deck.push(st.current);
        st.current = st.deck.shift() || null;
        if (!st.current) return render('The deck is empty: every scheme is ongoing. Abandon one to continue.');
        if (active === 'archenemy' && isOngoing(st.current)) st.ongoing.push(st.current);
        st.history.unshift(st.current);
        if (active === 'planechase') st.die = null;
        render();
    }

    function abandon(idx) {
        const st = state.archenemy;
        const [card] = st.ongoing.splice(idx, 1);
        if (!card) return;
        st.deck.push(card);
        if (st.current === card) st.current = null;
        render(`Abandoned ${card.name}; it goes to the bottom of the scheme deck.`);
    }

    // Planar die: 1 planeswalk face, 1 chaos face, 4 blank faces
    const DIE = [
        { face: 'planeswalk', icon: '🌀', label: 'Planeswalk!', note: 'Planeswalk to the next plane.' },
        { face: 'chaos', icon: '✺', label: 'Chaos!', note: "Trigger the current plane's chaos ability." },
        { face: 'blank', icon: '', label: 'Blank', note: 'Nothing happens.' },
        { face: 'blank', icon: '', label: 'Blank', note: 'Nothing happens.' },
        { face: 'blank', icon: '', label: 'Blank', note: 'Nothing happens.' },
        { face: 'blank', icon: '', label: 'Blank', note: 'Nothing happens.' }
    ];
    let rolling = false;
    function doRoll() {
        const st = state.planechase;
        if (rolling) return;
        rolling = true;
        const cost = st.rolls;
        let ticks = 0;
        const box = $('simDie');
        const timer = setInterval(() => {
            const f = DIE[Math.floor(Math.random() * 6)];
            box.innerHTML = dieHtml(f, true, cost);
            if (++ticks >= 8) {
                clearInterval(timer);
                st.die = DIE[Math.floor(Math.random() * 6)];
                st.rolls++;
                rolling = false;
                render();
            }
        }, 70);
    }

    function newTurn() {
        state.planechase.rolls = 0;
        state.planechase.die = null;
        render('New turn: your next planar die roll is free.');
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    function dieHtml(f, isRolling, cost) {
        return `<div class="die-face${isRolling ? ' rolling' : ''}">${f ? f.icon : '🎲'}</div>
            <div class="die-label">${isRolling ? 'Rolling…' : f ? f.label : 'Planar die'}</div>
            ${!isRolling && f ? `<div class="die-cost">${esc(f.note)}</div>` : ''}
            <div class="die-cost">${isRolling ? '' : nextCostText(state.planechase.rolls)}</div>`;
    }
    const nextCostText = rolls => rolls === 0 ? 'Next roll this turn: free' : `Rolls this turn: ${rolls} · next roll costs {${rolls}}`;

    function render(message) {
        const k = active;
        if (!k) return;
        const cfg = SIMS[k];
        const st = state[k];
        $('simBlurb').textContent = cfg.blurb;
        $('simDraw').textContent = cfg.drawLabel;
        $('simDraw').disabled = !st.pool || (!st.deck.length && !st.current);
        $('simShuffle').disabled = !st.pool;
        document.querySelectorAll('#simUI .planar-only').forEach(el => el.classList.toggle('hidden', k !== 'planechase'));
        document.querySelectorAll('#simUI .scheme-only').forEach(el => el.classList.toggle('hidden', k !== 'archenemy'));
        $('simRoll').disabled = !st.current;

        if (message !== undefined) $('simStatus').textContent = message;
        else if (st.pool) $('simStatus').textContent = st.current
            ? `${st.deck.length} ${cfg.noun}s left in the deck · ${st.history.length} revealed so far`
            : (st.deck.length ? `Deck ready: ${st.deck.length} ${cfg.noun}s. ${k === 'planechase' ? 'Planeswalk to reveal your starting plane.' : 'Set your first scheme in motion.'}` : `${st.pool.length} ${cfg.noun}s available. Press Shuffle to build the deck.`);

        // Current card
        const cur = st.current;
        if (!cur) {
            $('simCurrent').innerHTML = `<div class="sim-empty">${st.deck.length ? 'Deck shuffled. ' + (k === 'planechase' ? 'Planeswalk' : 'Set a scheme in motion') + ' to reveal a card.' : 'Shuffle to start.'}</div>`;
        } else {
            const landscape = cfg.landscape && !st.rotated;
            const note = k === 'planechase' && isPhenomenon(cur)
                ? 'Phenomenon: resolve its effect, then planeswalk again.'
                : (k === 'archenemy' && isOngoing(cur) ? 'Ongoing scheme: stays in play until you abandon it.' : '');
            $('simCurrent').innerHTML = `
                <div class="sim-frame ${landscape ? 'landscape' : 'portrait'}">
                    <img src="${esc(imageOf(cur, 'large'))}" alt="${esc(cur.name)}">
                </div>
                <div class="sim-card-name">${esc(cur.name)} <span class="muted">${esc(cur.type_line || '')} · ${esc((cur.set || '').toUpperCase())}</span></div>
                ${note ? `<div class="sim-card-note">${esc(note)}</div>` : ''}
                ${cfg.landscape ? `<button class="sim-small-btn btn-secondary" id="simRotate">↻ ${st.rotated ? 'Show landscape' : 'Show as scanned (portrait)'}</button>` : ''}`;
            const rot = $('simRotate');
            if (rot) rot.addEventListener('click', () => { st.rotated = !st.rotated; render(); });
        }

        // Die
        if (k === 'planechase' && !rolling) $('simDie').innerHTML = dieHtml(st.die, false);

        // Ongoing schemes
        if (k === 'archenemy') {
            $('simOngoing').innerHTML = `<strong>Ongoing schemes (${st.ongoing.length})</strong>` + (st.ongoing.length
                ? st.ongoing.map((c, i) => `<div class="ongoing-item"><img src="${esc(imageOf(c, 'small'))}" alt="Enlarge ${esc(c.name)}" title="Click to enlarge" class="zoomable" data-zoom="ongoing:${i}" loading="lazy"><span class="zoomable" data-zoom="ongoing:${i}">${esc(c.name)}</span><button data-abandon="${i}" class="btn-secondary">Abandon</button></div>`).join('')
                : '<div class="muted">None in play.</div>');
        }

        // History (most recent first, excluding the current card)
        const past = st.history.slice(1, 13);
        $('simHistory').innerHTML = past.length
            ? `<strong>Previously revealed</strong><div class="sim-history-row">${past.map((c, i) => `<div class="sim-thumb zoomable" data-zoom="history:${i + 1}" title="Click to enlarge"><img src="${esc(imageOf(c, 'small'))}" alt="Enlarge ${esc(c.name)}" loading="lazy">${esc(c.name)}</div>`).join('')}</div>`
            : '';
    }

    async function show(kind) {
        active = kind;
        const st = state[kind];
        render(st.pool ? undefined : `Loading every ${SIMS[kind].noun} from Scryfall…`);
        if (!st.pool) {
            try {
                await loadPool(kind);
                if (!st.deck.length && !st.current) st.deck = [];
                if (active === kind) render();
            } catch (e) {
                if (active === kind) render('❌ Could not load cards: ' + e.message);
            }
        }
    }

    $('simShuffle').addEventListener('click', doShuffle);
    $('simDraw').addEventListener('click', doDraw);
    $('simRoll').addEventListener('click', doRoll);
    $('simNewTurn').addEventListener('click', newTurn);
    $('simOngoing').addEventListener('click', e => {
        const b = e.target.closest('[data-abandon]');
        if (b) abandon(+b.dataset.abandon);
    });

    // ------------------------------------------------------------------
    // Click-to-enlarge (ongoing schemes and previously revealed cards)
    // ------------------------------------------------------------------
    const zoom = document.createElement('div');
    zoom.className = 'sim-zoom hidden';
    zoom.setAttribute('role', 'dialog');
    zoom.setAttribute('aria-modal', 'true');
    zoom.innerHTML = '<div class="sim-zoom-inner"><img alt=""><div class="sim-zoom-caption"></div><div class="muted">Click anywhere or press Esc to close</div></div>';
    document.body.appendChild(zoom);
    function openZoom(card) {
        const landscape = SIMS[active].landscape && !state[active].rotated;
        const img = zoom.querySelector('img');
        img.src = imageOf(card, 'large');
        img.alt = card.name;
        img.className = landscape ? 'landscape' : '';
        zoom.querySelector('.sim-zoom-caption').textContent = card.name + (card.type_line ? ' — ' + card.type_line : '');
        zoom.classList.remove('hidden');
    }
    const closeZoom = () => zoom.classList.add('hidden');
    zoom.addEventListener('click', closeZoom);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeZoom(); });
    $('simUI').addEventListener('click', e => {
        const t = e.target.closest('[data-zoom]');
        if (!t) return;
        const [list, idx] = t.dataset.zoom.split(':');
        const st = state[active];
        const card = (list === 'ongoing' ? st.ongoing : st.history)[+idx];
        if (card) openZoom(card);
    });

    window.Sims = { show };
})();
