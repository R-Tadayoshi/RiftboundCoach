# Adding a set to the engine

The metagame is defined by the newest set, so an engine frozen one set back
cannot reason about the decks people actually bring. `chorlick/alpharune`
covers UNL, OGN, SFD and OGS; anything newer has to be imported.

This is what it takes, and what each step is worth.

## 1. Fetch the set

```bash
node coach/fetch-set.js VEN
```

Pulls every base printing from RiftScribe — the official gallery alpharune's
own `scripts/fetch_cards.py` reads is outside this environment's network
policy — caches each record so a re-run only fetches what is new, and reports
two things.

**How much of the set is free:**

```
  vanilla             0   0%
  keywords-only       4   2%
  needs-behaviour   193  98%
```

**And any keyword the engine has never heard of**, which is engine work rather
than card work:

```
NEW MECHANICS — these need engine work, not just cards:
  empowered      on  59 card(s)
  empower        on  45 card(s)
  flow           on  17 card(s)
```

The keyword list is read from the engine's own `Keyword` enum, not from a copy
here that could go stale. The scan **refuses to run on textless records** — the
set index carries no card text, and scanning it finds nothing and means
nothing. That refusal exists because I did exactly that and reported "VEN
introduces no new keywords" from 197 empty strings.

The cache is committed (about 150K once image blobs are dropped), so the
import is reproducible with no network.

## 2. Generate the cards

```bash
node coach/gen-cards.js VEN          # dry run: says what it would do
node coach/gen-cards.js VEN --write
```

Writes one C++ file per card into the engine's `src/cards/<type>/`, adds each
to `cards/card_index.json`, and extends the generated aggregator. CMake globs
those directories, so no build files change.

It is idempotent: a card already present keeps its id, and the aggregator only
gains registrations it lacks. Running it twice is a no-op that says so.

What it generates is **data, not behaviour** — name, type, cost, might,
domains, tags, engine keywords with their riders, printed text. A card whose
text does something comes out a **stub**, and the engine plays a stub as a
blank.

That is safe only because of step 4.

## 3. Rebuild

```bash
cd ../chorlick/alpharune && cmake --build build
cd -                     && ./engine/build.sh    # our probes relink
```

Forgetting the second line is its own small trap: the probes link the engine's
static library, so they keep the old card set and report cards as unknown that
the engine now has.

## 4. Check what you actually gained

```bash
node coach/fidelity.js
```

```
before   787 cards   661 OK   126 STUB     0 ABSENT
after    984 cards   665 OK   319 STUB     0 ABSENT
```

**ABSENT to STUB is real progress, and it is not the same as support.** Decks
holding the new cards load, positions build, and the LLM coach — which reads
card text from RiftScribe and never needed the engine — works on them as it
always did. What does not work is *ranking* a board one of them is on: the gate
refuses, because the engine would play it as a blank and return a percentage
regardless.

## 5. Write bodies

The remaining work, card by card, with the gate flipping STUB to OK as each
lands. `node coach/fidelity.js` lists what is left.

New mechanics come first — nothing that uses Empower can be implemented until
the engine has the concept:

- **Empower / Empowered** (104 VEN cards). A per-object state, an activated
  ability that sets it once, and abilities that apply only while it holds.
- **Flow** (17 cards). Playing a card **from the trash** for an alternate cost,
  then banishing it. More invasive than it sounds: it adds a new *source* of
  legal actions, so the move generator has to look somewhere it currently does
  not.
- **Burn N** is just mill and needs no new concept. Note the engine already
  has `burned_out`, which is deck-out — an unrelated name collision.
- **Stun** is already an engine mechanic.

## Engine changes go in `engine/patches/`

The engine lives in a checkout that is not ours to push to, so a hand-written
change to it would be lost on a re-clone — silently, because everything
downstream fails closed and would simply start refusing to rank.

`engine/patches/apply.sh` re-applies them and skips any already in. Generated
cards are NOT patches: they are reproduced by `coach/gen-cards.js` from the
committed set data.

## What is actually left, and what it is blocked on

197 cards short of the 984 are unusable. They divide into engine work and
card work, and the split matters — the engine work unblocks cards in bulk
while each card is its own afternoon.

| blocked on | cards |
|---|---|
| **Empower / Empowered** | 53 |
| **Flow** (play from trash, then banish) | 16 |
| **Burn N** (mill) | 5 |
| enemy-attacks trigger | 1 |
| leaves-the-board trigger | 1 |
| nothing shared — each needs its own implementation | 121 |

### The three that pay

**Empower** is the biggest and the shape is known: a per-object boolean, an
activated ability that sets it once (`Use only if not Empowered`), and
abilities gated on it (`[Empowered][>] I have [Assault 3]`). No new trigger
plumbing, and the flag pattern already exists on `GameObject`.

**Flow** is smaller but more invasive, because it adds a new *source* of legal
actions: `generateMainPhaseActions` iterates the hand and Flow needs it to
iterate the trash too, with `executePlayCard` routing the card out of the
trash and banishing it on resolve.

**Burn N** is the cheapest of the three. `effect_executor.h` has no mill
primitive at all — not one — so `void burnCards(PlayerId, int)` moving N from
the top of the main deck to the trash is the whole job. (The engine's existing
`burned_out` is deck-out, an unrelated name collision.)

### Two one-card triggers, both correctly deferred

Nine-Tailed Fox needs a "when an enemy unit attacks a battlefield you control"
trigger; Treasure Trove needs "leaves the board", which is not the same as
`WhenIDie` — its file says so and is marked PARTIAL rather than pretending.
Adding a trigger means firing it at every site a permanent departs, and
missing one is a card that silently half-works.

## Naming, which has bitten five times

- A **legend** is printed with its champion tag and named without it. The board
  says "Irelia, Blade Dancer"; the card is "Blade Dancer". None of the 40
  legends in the index has a comma in its name. Deck files are written the long
  way too, so without this rule you cannot read the engine's own decks.
- **Variant printings are not all present.** RiftScribe serves Blade Dancer as
  SFD-195; the engine has only SFD-246. Resolve by code, then base code, then
  name.
- **A reprint must compare equal to its original.** The index writes `null` for
  an absent cost and an importer that writes `0` makes `Irelia, Fervent`
  (SFD-057, reprinted VEN-174) look like two different cards.
