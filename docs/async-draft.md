# Async draft

Written 15 November 2026. Phase 1 is built; the rest is still a plan.

## The problem it solves

The draft format means every player ends up with a pile of cards that never
make a deck. Those cards were printed, cut and sleeved anyway. Printing
happens before the draft because the draft needs physical cards — so the
waste is structural, not careless.

Inverting it: draft first, digitally, then print only the decks. Each player
drafts 42 cards and plays about 23 of them, so a deck plus a five-card
sideboard is 28 printed where 42 were printed before. Skip the basics and the
land sheets and it is roughly a third less paper, all of which gets played.

The second thing it buys is time. Nobody arrives and drafts for forty minutes;
everyone arrives with a deck.

## What changes about the app

Everything in this app runs in the browser. That is deliberate, and
`next.config.ts` says why: no API routes, no middleware, nothing metered.

An async draft cannot work that way. Eight people on eight devices at eight
different times have to agree on where each pack is, and that agreement has to
survive every browser being closed. This is the first feature in the app that
needs something awake when nobody is looking at it.

So this is a real step up, and worth naming what comes with it: state that
outlives a tab, therefore migrations and backups; an operational surface that
can run out of something; and the first code in the repo that cannot be tested
offline. The plan below is mostly about keeping those costs small.

## Identity: a room code, and no users

No accounts, no emails, no passwords, no user table.

- the **admin** creates a room and gets a code — six characters from an
  unambiguous alphabet, no `O`/`0` or `I`/`1`, e.g. `K7M-Q2F`. Their browser
  keeps an admin key; the page also shows a recovery string worth writing down.
- a **player** opens `/draft/K7MQ2F`, types a name, and claims a free seat.
  The server hands their browser a **seat key**, kept in `localStorage`. That
  key is what lets them pick.

The room code gets you into the room: the seat names, whose turn it is, how
far along everyone is. The seat key gets you your cards. Lose the browser and
the admin releases the seat for you to re-claim.

The room code cannot *carry* the draft the way a save code carries a
single-player game. Every pick changes the state and eight devices have to see
the same copy, so the code names the state rather than containing it. The pool
is the one part that is fixed at generation and could be encoded — but there is
no reason to, once the room exists.

## Where the state lives

Netlify Functions, with Netlify DB (Neon Postgres) for the draft state and
Netlify Blobs for the pool. One vendor, one deploy, no new accounts.

The site itself stays `output: "export"`. Static assets are not metered; only
the function calls are.

### The budget, and the rule it implies

Netlify's free plan is 300 credits a month as a **hard cap that pauses every
site on the account** when it is reached. Not blocked deploys — a paused site.
So the arithmetic matters more here than it would anywhere else.

The published rates are 2 credits per 10,000 web requests and 10 credits per
GB-hour of function compute. One draft is 8 players × 42 picks = 336 writes
plus a few hundred state reads; at a 512 MB function taking 200 ms that is
about **3 to 5 credits for a whole draft**, or a third of one production
deploy. Three or four drafts a month is noise.

Polling would destroy that. Eight tabs left open for three days asking every
five seconds is about 414,000 invocations, roughly 1,150 credits — four times
the monthly allowance, with the site paused as the penalty.

**Therefore: nothing polls, and there is no realtime.** State is fetched

- when a draft page opens,
- immediately after your own pick,
- when the tab regains focus, debounced to at most once a minute,
- when you press **Check for packs**.

This is not a compromise forced on the design so much as the design restated.
An async draft measured in days is a pull: you check whether a pack is waiting,
the way you check a mailbox. A socket held open for three days to tell you
something that changes twice a day is the wrong shape regardless of cost.

### Why a database and not just Blobs

A pick is a read-modify-write: read the pack, remove a card, work out where it
goes next, store it. Netlify's own guidance says not to build read-modify-write
on a blob key *even with `onlyIfMatch` retries*, and points at Netlify DB for
it. Two players picking in the same second is rare but a lost pick is
unfixable after the fact — there is no record of what the pack held, so there
is nothing to replay.

The pool is the opposite: generated once, never changed, read often. That is
written once to Blobs with `onlyIfNew` and never touched again.

The variant worth knowing about, if provisioning a database turns out to be
more trouble than it looks: store an append-only log of picks, one blob per
pick, keyed by pick number so `onlyIfNew` makes a collision impossible rather
than merely unlikely, and derive the state by replaying the log through the
engine. It is a nicer fit for Blobs and it costs a snapshot mechanism to keep
state reads from growing with the draft. Not worth it at eight players.

## The engine

The rules live in `src/lib/draft/` as pure functions, the way `src/lib/booster`
does, and the function handler is a thin shell that loads state, calls
`applyPick`, and writes the result back inside a transaction.

```ts
applyPick(state, { seat, packId, cardIds }): PickResult
queueFor(state, seat): PackState[]   // oldest arrival first
waitingOn(state): number[]           // which seats are holding packs
```

This is the only part of the feature that can be tested the way the rest of the
app is tested, so it should hold all of the reasoning. The handler should
contain no rules at all.

### Why async is safe

With a fixed seat order, **timing cannot change what anybody sees.** Pack 7
after four picks has been seen by seats 3, 4, 5 and 6, in that order, whether
that took nine seconds or two days: a pack's contents at each visit depend only
on the picks of the seats that saw it earlier, and the seat order is fixed at
the start.

So there is no need to hold anyone in lockstep. A pack moves the moment it is
picked from, a fast player's packs queue up at a slow one, and the result is
the draft you would have had in person. Players' *choices* of course depend on
what they have already taken — that is the game — but the sequence of pack
states each seat is offered does not.

That claim is worth a property test: replay a draft with the pick order
shuffled every way, assert each seat ends with the same cards.

### Flow rules

- packs are dealt at random, three to a seat; seats are assigned at random.
  Two shuffles, both at the moment the draft starts.
- direction is per round and defaults to **right, left, right**. Note the
  paper convention is left first; this follows what the draft does today, and
  is a setting rather than a constant so it can match a table later.
- `picksPerTurn` is 1 for a normal draft and 2 for commander. The last visit
  to a pack takes whatever is left, which is how an odd pack size resolves.
- a pack with nothing left is done and leaves the board.
- a round ends when **every** pack in it is empty, and only then does the next
  round open. This is the one place the draft gates on the slowest player, and
  it is deliberate: opening pack 2 early would let someone draft against
  information the others do not have yet.

### What is draftable

The generator produces more than packs. Token sheets, the land sheet and the
token separator are printing artifacts, not cards anybody drafts, and they are
excluded when the pool is built. Only entries from real packs go up.

The pool stored is **Scryfall IDs, a finish and a pack position** — about 336
of them for eight players, a few kilobytes. No card data is stored. Every
player's browser fetches the cards from Scryfall with `/cards/collection`
exactly as `/proxies` already does, and images come from Scryfall's CDN as they
do today.

## Deck building

Opens for a seat as soon as that seat has drafted its last card, so the fast
players have something to do.

- minimum 40 cards, the draft standard
- basics are free and unlimited, and are not drawn from the pool
- a sideboard of five, which is the sideboard the printing budget can pay for
  rather than the one the rules allow
- everything else must come from that seat's own 42 cards
- submitting locks it; the admin can unlock a seat

## Printing

The part that already works. A submitted deck is
`QUANTITY NAME (SET) NUMBER`, which is exactly what `/proxies` reads — and
because every drafted card is a known printing by construction, it never
touches the name-resolution fallback at all.

The admin page collects every submitted deck into one pile:

- a page break per player, and a divider card carrying their name through the
  separator mechanism
- **don't print basic lands**, on by default — the one option asked for
  explicitly, and the bulk of the saving
- a per-player decklist to copy, so a deck can be hand-edited before printing

## Hidden information

The server only ever sends a player the contents of their own queue. Public
information — names, seat order, pick counts, whose turn — is public; pack
contents are not. Reaching another player's pack means having their seat key.

This costs a few endpoints rather than one, which the design wants anyway: the
function is already the only writer, so it is already the only thing that needs
to know the whole board.

Two things it does not defend against, and should not try to: a player who
forwards their own seat link, and the admin, who can see everything by
construction.

## When a player goes quiet

The admin can pick for them. The board shows who is holding things up and how
long for, and the admin takes a card on their behalf — chosen, or random.

No clocks. A timer that fires while someone is asleep takes cards off them for
being asleep, and a draft among friends has a better mechanism available,
which is texting them.

## Environments

New, and easy to get wrong: branch deploys share an account. `next` and `dev`
both build and both would call functions, so without scoping, a test room on a
branch deploy writes to the same database as a real draft.

Netlify environment variables are per deploy context, so the database URL and
the blob store name differ by context, and the production context is the only
one that can see real rooms. A room code is six characters and collisions
across contexts would otherwise be a matter of luck.

## Phases

1. **The engine** — done, 15 November 2026. `src/lib/draft/` and 31 tests in
   `tests/draft.test.ts`. No network, nothing provisioned.

   The order-independence claim is asserted three ways and the assertion was
   checked by breaking it: making the pass direction depend on the clock fails
   exactly those three tests and nothing else in the file. Worth repeating that
   check if the engine is ever rewritten — a property test that cannot fail is
   decoration.

   Two things the engine deliberately does not do. It does not make a seat pick
   from its oldest pack, because a pack visits the same seats in the same order
   either way, so the queue order is a thing to display rather than a rule. And
   it identifies a card by a **key** naming one physical card rather than by a
   Scryfall id, because a generated pack can hold two copies of one printing
   and "I take this one" has to mean something; `dealPacks` refuses a pool
   where a key repeats.
2. **The room.** Schema, functions, room creation, seat claim, pool upload from
   the generator the admin already uses.
3. **The draft.** Your queue, your picks, the board, Check for packs.
4. **Deck building** and submission.
5. **Admin printing**, through `/proxies`.
6. **Polish.** The draft log, who is holding it up, reassigning a seat,
   picking for an absent player.

Phase 1 is worth doing on its own even if the rest waits: it is the part with
the reasoning in it, and it costs nothing to run.

## Decided against

- **accounts.** Asked about and rejected as too much complexity for eight
  friends. A room code plus a seat key in `localStorage` does the same job with
  no user table.
- **realtime and polling.** Not a design preference — see the budget above.
- **lockstep picking.** Unnecessary, because timing cannot change what anyone
  sees.
- **Supabase and Cloudflare.** Both would work; Supabase free projects pause
  after about a week idle and need unpausing by hand, which is a second thing
  to watch. Staying on one vendor won.

## Open

- **the production cut-over comes first.** `main` still serves the old
  plain-scripts app and has no functions; this cannot ship to anybody until the
  Next.js app is live. See TODO.md.
- a draft spans days, so a player's `localStorage` is the only thing holding
  their seat. Worth considering whether the seat key should also be in the URL
  the admin hands out, so the link itself is recoverable.
- commander draft is two picks a turn, but is it also a different pack size or
  deck size? Not specified yet.
