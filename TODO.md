# TODO

Open work for the booster generator. Newest decisions at the top of each section;
anything already settled lives in the README instead.

## Deployment

- [ ] **Cut `main` over to the Next.js app** — *waiting on credits*
  `next` holds the rewrite and is fully ported; `main` and `dev` still serve the
  plain-scripts app. The cut-over is `git checkout main && git merge next`,
  which costs one production deploy (15 credits). We were at 285/300 in late
  October, so it waits for the 19 November reset rather than spending the last
  of the month's credits on it.
  - `next`'s `netlify.toml` already runs `npm run build` and publishes `out/`;
    nothing else needs changing for the cut-over
  - `dev` keeps the old app until then, which is the rollback if anything is
    wrong after the merge
  - check the deployed site before deciding the migration is finished: the
    branch deploy at `next--mtg-draft-generator.netlify.app` is the same build

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
  - the job merges the working branch into `main`; Netlify then builds once
    (15 credits)
  - a cron such as `0 17 20 11 *` fires every year, so guard it on the year or
    delete it after it runs
  - it pushes to `main` unattended, shipping everything accumulated on `dev` in
    one deploy — that is the point, but it should be a deliberate choice

- [ ] **Set `build_settings.dir` to `.` in the Netlify UI**
  It is currently empty. Deploys work because `netlify.toml` sets
  `publish = "."` and the file wins, but nothing would cover us if the toml were
  renamed or removed.

## Frontend

- [x] **Move to Next.js + TypeScript + shadcn/ui** — done, 30–31 October 2026
  Planned and recorded in [docs/nextjs-migration.md](docs/nextjs-migration.md),
  carried out in six phases on the `next` branch. The old plain-scripts app,
  `build.py` and the single-file build in `dist/` are gone; what they did is
  written up in that document, including what was given up (a file you could
  email, and opening the app from disk) and why.

  That settles the CSS/UI framework question this superseded: shadcn/ui means
  React, Tailwind and a bundler, so the no-build property went with it. The
  alternative considered was a CSS-only framework (Bootstrap, Bulma, Pico.css)
  which would have kept it; the reasoning is in the migration document.

- [ ] **Dark mode is new; the old app had none**
  Added after phase 5 and following the system by default. Nothing here needs
  doing — it is noted because it is the one place the rewrite does more than
  the app it replaced, rather than the same thing differently.

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

- [ ] **The golden files cannot be regenerated**
  `tests/golden/*.txt` hold what the old implementation produced for every case
  the suite covers, read out of it on its last day. When the odds change on
  purpose — the 2027 revisit above will — the tests will fail, and the right
  response is to read the diff and update the file by hand rather than to
  re-record, which is no longer possible.
