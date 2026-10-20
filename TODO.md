# TODO

Open work for the booster generator. Newest decisions at the top of each section;
anything already settled lives in the README instead.

## Deployment

- [ ] **Automate the monthly production deploy** — *after 19 November 2026*
  Credits reset on 19 Nov (`next_billing_period_start`), so set this up on the
  20th or later, with the cycle fresh. Deliberately not done in October: the
  free plan is a hard limit and running out pauses the project, so visitors get
  a "Site not available" page rather than just deploys being blocked. We were at
  285/300 and did not want to gamble the site being served.
  - a GitHub Actions `schedule` workflow only fires from the default branch, so
    it has to live on `main`, not `dev`
  - land it on `main` with `[skip ci]` in the commit message so installing it
    does not itself cost a production deploy
  - the job merges `dev` into `main`; Netlify then builds once (15 credits)
  - a cron such as `0 17 20 11 *` fires every year, so guard it on the year or
    delete it after it runs
  - it pushes to `main` unattended, shipping everything accumulated on `dev` in
    one deploy — that is the point, but it should be a deliberate choice

- [ ] **Set `build_settings.dir` to `.` in the Netlify UI**
  It is currently empty. Deploys work because `netlify.toml` sets
  `publish = "."` and the file wins, but nothing would cover us if the toml were
  renamed or removed.

## Frontend

- [ ] **Decide on a CSS/UI framework** (Bootstrap, shadcn/ui or something smaller)
  The app is deliberately plain today: browser scripts sharing one global scope,
  no bundler, no install, and `build.py` inlines everything into a single
  shareable HTML file. The README sells that ("No install, build step or local
  server is needed"), so the choice is really about how much of it to give up.
  - **Bootstrap** (or Bulma, Pico.css, Water.css) is CSS-only. It can be a CDN
    link or a vendored file and keeps the no-build property; `build.py` would
    inline it for `dist/` the way it already does for `css/styles.css`, or leave
    it as a CDN link like pdf-lib. Smallest disruption, and `css/styles.css` is
    only ~150 lines, so most of it would be replaced rather than fought with.
  - **shadcn/ui** is not a CSS framework — it is React components you copy into
    a project, and it needs React, Tailwind and a bundler. Adopting it means
    rewriting the UI as components and giving up the single-file build unless we
    add a real bundler step. Much larger job; worth it only if we want a React
    app, not just better-looking controls.
  - Worth settling first: do we keep "open `index.html` and it works"? If yes,
    that rules shadcn out on its own.

## Pack simulation

- [ ] **Japan Showcase cards in the wildcard slot** (2027 rules)
  Wizards' 2027 announcement puts them in the wildcard slot in traditional foil.
  Not implemented because there is no Scryfall predicate for them yet —
  `promo:japanshowcase` returns "All of your terms were ignored". Needs a
  working query before it can be built; it would then hang off `processCard` in
  `generate.js`, like the Guest List swap, since it is a printing swap rather
  than a slot change.

- [ ] **Revisit the 2027 odds when "Collecting Nauctis" publishes** (~Jan 2027)
  Nauctis releases 2027-02-05 and has no cards on Scryfall yet. The published
  set article should give the real numbers for the foil slot and the Japan
  Showcase rate, which are currently derived rather than official.

- [ ] **Optional: "even wildcard odds" toggle**
  Fun mode replaces both wildcard sheets with even-by-card-name picking whatever
  the multiplier is, so fun x1 still differs from vanilla in slots 13 and 14. A
  toggle (on by default) would let the other fun options be used without that,
  and make x1 genuinely match vanilla.

- [ ] **Optional: odds-ratio scaling instead of the hard clamp**
  `p' = m·p / (1 + (m−1)·p)` never saturates, so a set whose base mythic share is
  already high keeps responding past x2. We kept the literal multiplier on
  purpose — "x3" meaning three times the mythics is the more intuitive promise,
  and the slot 10 guaranteed rare now covers the case that prompted this. Only
  worth revisiting if the clamp shows up on a real, fully spoiled set.

- [ ] **Optional: let slot 10 roll rare-or-mythic**
  It is a flat rare today, chosen deliberately because the goal was rares and
  slot 11 already carries the mythic chance.

- [ ] **Open question: should the land slot still be 20% foil?**
  The 2027 rules remove foil commons and uncommons, and basic lands are common
  rarity, so arguably foil lands go too. Wizards' announcement says nothing
  about the land slot and Collector Booster God Packs still list a foil land, so
  it was left alone rather than guessed at. It is now the larger share of the
  remaining foils (0.2 of about 0.32 per pack).

- [ ] **Optional: God Pack "Booster Fun" fidelity**
  The two Booster Fun slots and two foil Booster Fun slots prefer an alternate
  treatment, but the other ten use the normal random-printing rule, so some of
  them come out Booster Fun too. Wizards lists those ten as plain, which would
  mean forcing a default-frame printing — at odds with how every other slot in
  this app picks printings.

## Housekeeping

- [ ] **`dist/` is committed and rebuilt by hand**
  `python3 build.py` has to be remembered on every change. A pre-commit hook, or
  building it in CI, would stop the single-file copy drifting from source.
