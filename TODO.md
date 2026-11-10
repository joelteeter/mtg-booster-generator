# TODO

Open work for the booster generator. Newest decisions at the top of each section;
anything already settled lives in the README instead.

## Deployment

- [ ] **Cut `main` over to the Next.js app** — *waiting on credits*
  `next` and `dev` both hold the rewrite; `main` still serves the plain-scripts
  app. The cut-over is `git checkout main && git merge dev`, which costs one
  production deploy (15 credits) and so waits for the reset: the billing period
  runs 19 October to 18 November.
  - `netlify.toml` on both branches already runs `npm run build` and publishes
    `out/`; nothing else needs changing for the cut-over
  - `main` is the rollback until it is cut over: the old app is live on it, and
    stays in this repo's history afterwards
  - **14 credits left** as of 8 November, confirmed on the billing page. A
    production deploy costs 15, so this period cannot pay for one at all —
    there is no judgement left in the wait, only arithmetic
  - read that number off the billing page, not the API: `getAccount`'s
    `capabilities.credits` reported `used: 0` on the same day, for the same
    period. It sits beside concurrency counters that are also `0` and is not a
    period total

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

- [x] **A site header, with a menu below `md`** — done, 31 October 2026
  Sticky, with the brand, the three pages and the theme toggle; the links
  collapse behind a button on a phone. The header lists pages, so the choice
  between the two booster builders went back to being a tab strip on the page
  it belongs to — nav for where you are, tabs for what the controls mean.

  The menu is a disclosure panel rather than a slide-in drawer: for three
  links a drawer is a portal, a focus trap and a scroll lock around a list
  that already fits on the screen.

- [x] **Simulators are their own pages** — done, 31 October 2026
  `/planechase` and `/archenemy`, rather than two more values of the `mode`
  variable. They share nothing with the booster builders — no set, no options,
  no packs — so everything reading `mode` had to allow for a mode that had
  none of it. The strip across the top is navigation now; the two builders
  still share the front page, because they share every control under them.

  One behaviour changed with it: visiting a simulator no longer throws away a
  finished booster run. Switching between the two builders still does, since
  the packs belong to the one being left.

- [x] **Option: leave every card non-foil** — done, 9 November 2026
  On by default, since the app exists to print proxies and a home printer
  cannot make a foil. It is a printing preference rather than an odds change,
  so it survives vanilla mode, is shared by both booster tabs instead of
  living in `byMode`, and is applied to the slot drafts by `withoutFoils`
  before `finalizeSlots` — which keeps the panel and the generator reading one
  outcome list.

  The one slot that loses more than a finish is Commander Legends' foil-etched
  legend: it is a separate printing with its own frame, drawn from the
  `etched` pool, so the outcome is dropped and its 1-in-15 share redistributed
  rather than merely set to non-foil.

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

  Done once so far, and `tests/golden/generate.txt` logs it in its own header:
  the non-foil option added `opts.noFoils = false` to nine recorded options
  dumps. That value is the recorded behaviour, so no pack, file or status line
  moved — which is exactly what to check before accepting a golden diff.
