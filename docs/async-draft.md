# Async draft

Written 15 November 2026, built 15–20 November. All five phases are done;
what is left is listed at the bottom.

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

Netlify Functions, with Netlify Blobs holding everything. One vendor, one
deploy, no new accounts, and nothing to provision.

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

That number was quoted once before it was true, and the correction is the
reason the storage is what it is — see below. It counts the function. It does
not count a database, because there no longer is one.

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

### Why not a database, in the end

The first version of this plan put the draft in Netlify DB, on the grounds
that a pick is a read-modify-write and Netlify's own guidance says not to
build one on a blob key even with `onlyIfMatch` retries. That reasoning was
sound and the conclusion was still wrong, because it priced the wrong thing.

Netlify Database is metered by how long it is **awake**, not by how much work
it does. Their own worked example: "33 hours of using the minimum compute (1
unit) — consuming 1 unit per hour", and active time counts "including idle
time before going to sleep". The free plan sleeps after five minutes and five
minutes is also its maximum, with a ceiling of 48 compute units in a billing
period.

So an isolated request costs about five minutes of billed wake time however
briefly it ran — and an async draft is *made of* isolated requests. That is
the premise, not an accident of it. Three hundred and thirty-six picks plus a
few hundred checks, spread over a fortnight the way people actually behave,
comes to sixty-odd hours awake: past the 48-unit ceiling on its own, before
asking whether those units are billed at ten credits each or included. The
same draft, if everyone happened to pick inside the same five-minute windows,
would cost about four. A fifteen-fold swing, with the design sitting at the
expensive end.

Blobs has no such meter. The function invocation is the whole cost, which is
the 3 to 5 credits above.

### The revision chain

What a database was for was the conditional write, and object storage can do
exactly one conditional thing: create a key that does not exist. That turns
out to be enough, because **the key can be the lock**.

A draft is a sequence of immutable blobs. Writing means creating the next one:

```
rooms/K7MQ2F/rev/0000      the room as created
rooms/K7MQ2F/rev/0001      … after the deal
rooms/K7MQ2F/rev/0002      … after a pick
rooms/K7MQ2F/seat/0000     a player
rooms/K7MQ2F/pick/0001     the log, one blob a pick
```

Two requests that both computed from revision 7 both try to create
`rev/0008` with `onlyIfNew`; exactly one succeeds and the loser is told so.
That is the same `rev`-conditional `UPDATE` the SQL version did, expressed as
a filename — and unlike `onlyIfMatch` on a mutable key, it is safe by
construction rather than by the storage honouring a comparison.

Three consequences worth having:

- **it is append-only**, so the chain is a second backup beside the pick log.
  Every state the draft was ever in is still there.
- **slots bound the room.** A player claims `seat/0000`, `seat/0001` … upward
  with the same operation, so two people cannot take one seat and nobody can
  take an eighth in a seven-seat room. Names cannot be claimed that way, so
  they are settled by a rule both racers apply identically: among players
  sharing a name, the lowest slot keeps it and anybody above withdraws.
- **a list may lag a write.** Finding the newest revision by listing could
  therefore hand back a draft one pick out of date, whose own write would then
  land on a key that already exists — a player told they had been beaten to it
  by themselves. So the chain lists for a floor and then probes forward by
  name until it misses. Revisions are consecutive, so the first gap is the
  end. There is a test that hides keys from the list, and removing the probe
  fails it.

Four digits of zero padding, so lexicographic order is numeric order, which
caps a draft at 9,999 revisions. A nine-seat draft is about four hundred.

The storage port earned itself here. Swapping Postgres for blobs was one new
implementation of `Store`, and the engine, the view, the room operations and
their tests did not change at all.

### What the browser holds

One thing, and it is not state:

```
localStorage["draft:K7MQ2F"] = "<seat key>"
```

No cached packs, no copy of the draft, nothing to reconcile. The database is
the only truth and the browser holds a credential, so there is no question of
the two disagreeing — only of whether the credential is still good, which
nothing but the server can answer. A page load sends the key and gets one of
three answers: your view of the room, or "this browser is not seated here"
with the free seats listed, or the public view if there is no key at all.

That the key is in `localStorage` makes it a cache rather than the record,
which matters because **Safari deletes it**: WebKit's cap on script-writable
storage clears it for a site the user has not interacted with for seven days,
and a draft can easily run longer than that. On iOS that is most of a group of
friends.

So the key lives in the link the admin hands out, in the **fragment**:

```
https://…/draft/K7MQ2F#s=9f3c…
```

A fragment is never sent to the server, so it stays out of access logs and out
of `Referer` headers, unlike a query string. The page reads it once, stores it,
and the link in somebody's messages stays a working way back in after Safari
has forgotten. The cost is honest and worth stating: that link is the seat, so
pasting it into the group chat gives the seat away. The admin can re-issue one,
which invalidates the old.

### The seat-scoped view

What a player may see is pure functions in `src/lib/draft/view.ts`, beside the
engine — and it is **two** of them rather than the one this plan first called
`viewFor`. `boardView` is what everybody may see; `seatView` is what one seat
may see.

Two, because then the type system enforces it. A `BoardView` has nowhere to put
a card, so no handler can leak one into it by being careless, and the test
backs that up the only way worth doing: it serialises a board after a few picks
and searches it for every card key and every Scryfall id in the pool.

Making them functions rather than care taken in each handler is the rest of the
point. The hidden-information rule gets tested once, the way the pick rules
are, instead of being re-honoured correctly in four separate endpoints.

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
- direction is per round and defaults to **left, right, left**, which is how
  a paper draft goes. It defaulted the other way round at first, from an
  offhand example rather than anybody's convention, and was corrected on
  23 November. Still a setting rather than a constant, so a table that does
  it differently can. A room keeps the pattern it was made with, so changing
  the default does not reach into a draft already running.
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

- minimum 40 cards, the draft standard
- basics are free and unlimited, and are not drawn from the pool
- a sideboard of five, which is the sideboard the printing budget can pay for
  rather than the one the rules allow
- everything else must come from that seat's own cards
- the admin can hand a submitted deck back

Three things settled in the building of it.

**A half-built deck can be saved, and only a finished one is checked.** A
draft runs over days and so does building; nobody should have to do it in one
sitting, or keep it in a browser that Safari will clear. That is affordable
because a deck lives on the player's own row, which has exactly one writer —
no revision to lose, so no contention and no reason to make saving rare.

**Editing a submitted deck takes it back off the pile.** The alternative is a
deck the admin has already printed changing underneath them, which is worse
than having to press the button again.

**Basics are counted by name, not as cards.** Nobody opened them, so there is
no card key to give them, and which printing they get is a question for
whoever prints them — if they are printed at all, which by default they are
not. That is also what keeps the 40 honest: the check counts drafted cards
*and* basics, so seventeen Forests really do get you to forty.

The builder itself still makes no Scryfall request: the piles are images
derived from ids, and you sort by looking at them. Names and mana costs would
make it a better builder and cost a request per seventy-five cards — worth it
when the decklist has to be written out for printing, which is the next
phase, and not worth it to move a picture from one pile to another.

## Printing

The part that already works. A submitted deck is
`QUANTITY NAME (SET) NUMBER`, which is exactly what `/proxies` reads — and
because every drafted card is a known printing by construction, it never
touches the name-resolution fallback at all.

The admin's panel collects every deck:

- **one file a player**, plus one holding everybody. A player is a *row*, and
  `runExport` already starts a new page per row — so the page break between
  people is the exporter's own `newPagePerPack`, forced on rather than left to
  a setting, because two people's decks sharing a sheet is never what was
  wanted and cutting them apart afterwards is somebody's evening.
- **don't print basic lands**, on by default — the one option asked for
  explicitly, and the bulk of the saving: 25 cards a player instead of 42.
- **a per-player decklist to copy**, so a deck can be pasted into `/proxies`
  and hand-edited before printing. There is a test that reads one back with
  the proxy parser and gets the same cards in the same numbers, because that
  claim is only true if the two agree on the format down to the brackets.

No divider card, which the plan had asked for. It would have meant generating
an image with a name on it, and a file per player does the same job better —
you print Ada's deck, not page 14 to 17 of a pile.

Two things worth keeping:

**Basics are looked up in the draft's own set.** The cards come back first and
say which set most of the draft was; the lands are then asked for in that one.
A deck of Kamigawa commons with a Zendikar Forest in it would print perfectly
and look wrong on the table. It costs a second request and nothing else.

**This is the first part of the draft that asks Scryfall anything.** Picking
and building need an image, and an image comes from an id. A decklist needs
names, set codes and collector numbers — one `/cards/collection` request per
seventy-five cards, by id, so no printing can resolve to the wrong art. The
Proxies page has a whole fallback chain for exactly that problem and this
never reaches it.

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

## Provisioning

None. Blobs needs no connection string and no setup inside a Netlify
function, so there is nothing to run and nothing to pay for until somebody
makes a room.

Not using Netlify Database also means not installing `@netlify/database`,
which is what triggers Netlify to provision a database in the first place.

A deploy where Blobs is unreachable answers 503 to draft requests and serves
every page as usual, which is what a context without the runtime should do.

### What a branch deploy shares is unresolved

Blobs are scoped to a site, not to a deploy context, so `next`, `dev` and
production very likely share one store — which means a test room made on a
branch deploy would sit in the same place as a real draft. Nothing read so far
says otherwise.

It is not dangerous, because rooms are independent and a test room cannot
touch a real one. It is untidy, and it wants settling before a real draft
runs: the fix, if it is needed, is to name the store after the deploy context
rather than `drafts`, which is one argument to `netlifyBucket`.

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
2. **The room** — done, 15 November 2026. The whole server: the `Store` port
   and the room operations in `src/lib/room/`, the view split in
   `src/lib/draft/view.ts`, the revision chain in `src/lib/room/blob-store.ts`,
   its Netlify adapter in `netlify/lib/`, and one function in
   `netlify/functions/draft.mts`. 54 more tests.

   Built on Postgres first and moved to Blobs the same day, once the database's
   billing turned out to be metered by wake time — the reasoning is under "Why
   not a database, in the end". The move cost one new implementation of the
   storage port and changed nothing above it, which is the only evidence worth
   having that the port was worth writing.

   Picking was pulled forward out of phase 3, which was the right boundary
   after all: phase 2 is now the entire server and phase 3 is the entire
   client. A room you cannot pick from is not a room you can test, and
   `applyPick` was already written.

   Five things decided while building it, each in the code's own comments:

   - **the seat assignment lives in the draft row**, not in a column of
     `player`. That makes dealing one conditional write instead of a
     transaction, so a draft whose packs were shuffled by one deal and whose
     seats came from another is a state that cannot be represented — and it
     removed a method from the storage port rather than adding careful SQL to
     it. Two clicks of Start is exactly how you would otherwise get one.
   - **`lost-race` is its own refusal**, not `not-your-pack`. The whole draft
     is one row, so two picks from two different packs still serialise on the
     same `rev` and one loses — but that pick is almost certainly still legal,
     so the client re-reads and sends it again rather than telling somebody
     their pack moved on. Normalising packs into rows of their own would remove
     the contention and, at eight people picking twice a day, would be removing
     nothing.
   - **the room code is Crockford's base32**, picked rather than invented. It
     is meant to be read aloud, so I, L, O and U are gone; it is exactly 32
     characters, so reducing a random byte modulo the alphabet stays uniform;
     and it defines how to read a mistyped one, which `tidyCode` follows.
   - **the storage port exists for the race conditions.** `putDraft` is only
     safe because the `rev` check and the write are one statement, and
     `addPlayer` only because the seat count and the insert are. The fake in
     `tests/memory-store.ts` honours both, and copies rows in and out the way a
     real database does, so an operation that mutated what it read would fail
     there too.
   - **`src/lib/draft` and `src/lib/room` import each other relatively**, not
     through `@/`. They are bundled into the function as well as the app, and
     the path alias is something only Next's bundler knows. Verified by
     bundling the function with esbuild rather than by reasoning about it.

   The seat count is also settled: `maxSeats` is a cap on joining, and the
   table is whoever turned up. The admin generates the packs *after* seeing the
   turnout, which is the real workflow and removes the earlier worry about
   six people arriving for an eight-seat pool.

3. **The draft, in the browser** — done, 15 November 2026. `/draft`: the gate,
   the lobby and the board, in `src/components/draft/`, with the API client in
   `src/lib/room-client.ts` and the seam to the generator in
   `src/lib/draft-pool.ts`. 19 more tests, and the whole flow driven in a
   browser against `netlify dev` — room made, three players joined, packs
   dealt, a card taken, the pass watched, and the finished state reached.

   Three things worth keeping:

   - **a pack costs no API request.** `artById` derives Scryfall's CDN path
     from the id, and the view already hands over ids, so a pack appears
     without asking Scryfall anything. The deck builder will need real card
     data for a decklist; picking does not.
   - **the room is read without an effect that sets state.** The page is
     prerendered, so neither the address bar nor `localStorage` exists at
     first render, and the obvious `useEffect` is both a lint error and a
     wasted render. `useSyncExternalStore` over a snapshot cached at module
     scope says the true thing instead: arriving happens once.
   - **a lost race is retried once, silently.** The client re-sends the same
     pick rather than reporting it, which is what `lost-race` being its own
     refusal was for.

   The route is `/draft?room=CODE`, not `/draft/CODE`: a static export has to
   know every path at build time and a room code is not knowable then. The
   seat key rides in the fragment, is saved on arrival, and is then taken out
   of the address bar, so a screenshot of the page does not hand over a seat.

   Also here because it had nowhere else to go: `netlify dev` pins both ports
   in `netlify.toml`. Left alone, Netlify puts its own port in the environment,
   Next reads `PORT`, binds there, and Netlify waits forever for a framework
   listening on the address Netlify is listening on itself.
4. **Deck building** — done, 20 November 2026. `checkDeck` in
   `src/lib/draft/deck.ts` is the only thing that decides legality, and both
   the browser and the handler call it, so the page is showing the server's
   answer early rather than forming its own. `src/components/draft/deck-builder.tsx`
   is three piles and six steppers; one tap moves a card on. 23 more tests,
   and the whole thing built and handed in through a browser.

   It turned up a real hole, which is now the model: **playing and running a
   draft are separate facts, not one role.** Whoever organises a draft is
   normally in it, and the browser sends a seat key as its identity — so the
   admin key has to travel beside it rather than instead of it. Before that,
   the one person certain to need both could only ever be one.

5. **Admin printing** — done, 20 November 2026. `src/lib/draft-print.ts` and
   `src/components/draft/deck-prints.tsx`: one file a player, the decklists to
   copy, and the basics switch. 15 more tests, including the round trip
   through the proxy parser and the page break asserted against the
   exporter's own pagination rather than by reading a PDF.

   `proxyEntries` was split so that `cardEntries` — cards to printed slots,
   double-faced ones included — is shared rather than copied. The face
   splitting cannot now be right on one page and wrong on the other.

   Verified in a browser: two drafted decks, looked up live from Scryfall,
   printed to `Draft-XW58J1-All-2.pdf` and `Draft-XW58J1-1-Bram.pdf`.
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
- **Netlify Database**, after building on it. Metered by wake time with a
  five-minute floor, which is the worst possible shape for a draft made of
  sparse requests. Running Neon directly instead would have kept the SQL
  unchanged and removed the coupling to the credit cap that pauses the site,
  and was turned down to avoid a second account: free hosting is a hard
  constraint here, so the feature is designed to fit inside one rather than to
  be worth paying for.

## What it cost, in the end

The arithmetic the whole thing was for, on a real eight-player draft:

| | printed |
|---|---|
| drafting in person | 8 × 3 × 14 = **336 cards**, plus land and token sheets |
| drafting first | 8 × 25 = **200 cards**, and every one of them played |

Twenty-five is a forty-card deck minus seventeen basics, plus a sideboard of
five. Turning the basics on makes it 336 against 336, which is why that switch
is off: the saving *is* the basics and the cards nobody picked.

## Open

- **the production cut-over comes first.** `main` still serves the old
  plain-scripts app and has no functions; this cannot ship to anybody until the
  Next.js app is live. See TODO.md.
- a draft spans days, so a player's `localStorage` is the only thing holding
  their seat. Worth considering whether the seat key should also be in the URL
  the admin hands out, so the link itself is recoverable.
- commander draft is two picks a turn, but is it also a different pack size or
  deck size? Not specified yet.
