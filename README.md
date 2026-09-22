# Riftbound Coach

A live game-state extractor for [Rift Atlas](https://play.riftatlas.com), built
to feed an LLM coach during **solo practice**.

It reads the board the way a screenshot would — passively, through the DOM —
and hands a structured snapshot to a local process. It never clicks, drags, or
writes to the page.


## Running it: one command, then a button

```bash
cp rbc.config.example.json rbc.config.json   # once — point it at your decks
export OPENROUTER_API_KEY=sk-or-...
npm start
```

Then open **http://127.0.0.1:8787** and press **Ask the coach** — or press
**Ctrl+Shift+A** in the game tab without leaving it. The page shows the
advice, the engine's ranking, and what the legality checker made of the
answer.

`npm start` runs the sidecar and the coach together and kills both when you
Ctrl+C. If a sidecar is already up — easy to do, since it is a server and
outlives the terminal that printed to it — it reuses that one rather than
dying with an `EADDRINUSE` stack trace, which names the symptom and nothing
you can do about it. Something else on 8787 gets said plainly instead.

### Why it waits to be asked

The coach used to answer whenever the board's sequence moved. During your own
turn that is every rune tap and every card — four actions meant four model
calls, three of them about a board you were halfway through changing.

So the trigger is a request now, not a change. The sidecar holds **one**
pending ask: pressing the button again while you are thinking replaces it
rather than queueing, because "what should I do here" is a question about the
board as it is now, not about three boards ago.

The old behaviour is still there when you want it — `node coach/index.js`
watches and answers on your turns, `--every` on every change.

## Ranking your options with a real engine

The coach reads the board and never proposes an illegal play, but nothing in
it ranks one legal line above another — it says "here is an option", never
"this one is better". That needs search, and search needs an engine that knows
the cards.

`chorlick/alpharune` is a C++ Riftbound engine. The bridge is in `engine/`
and `coach/engine.js`; `docs/alpharune-integration.md` records what was
checked against its source rather than its README.

```bash
# once: build the engine, apply our patches, then build our probes against it
cd ../chorlick/alpharune && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build
cd -   && ./engine/patches/apply.sh && ./engine/build.sh

node coach/doctor.js        # is every link in place? says which is not
node coach/index.js --rank --deck-mine decks/mine.txt --deck-theirs decks/theirs.txt
```

**Run `node coach/doctor.js` first.** The ranking path has a lot of links — a
C++ engine built from source, a patch set applied to it, an imported card set,
two relinked probes, two decklists — and every one fails closed, which is right
and makes diagnosis miserable: the symptom of any break is the same quiet
"answering without the engine". The doctor checks each in dependency order and
names the one that is down.

It catches the trap that costs the most time: the probes link the engine's
static library, so rebuilding the engine without re-running `engine/build.sh`
leaves them holding the previous card set, reporting cards as unknown that the
engine now has.

What it prints:

```
ENGINE RANKING — rollouts from this exact board, not opinion:
  82.7%  P1: PlayCard card=2
  37.2%  P1: EndTurn

The engine separates "P1: PlayCard card=2" from the rest. Lead with it.
Worst by a clear margin: "P1: EndTurn" at 37.2%.
```

The ranking then goes into the prompt, and the model's job shrinks to
explaining it. That is the division of labour: the engine decides which line
is better, the model says why in words. It was never bad at explaining — it
was bad at knowing.

**It fails closed, every way in.** No engine build, no decklists, a card the
engine holds only as a stub, a ranking whose rows will not parse — each one
prints the reason and falls back to the model reasoning unaided. What it never
does is attach a percentage to a board the engine could not faithfully build.

**Both decklists are required, and theirs is a guess.** Their unseen cards are
sampled from what is left of the list you give, so a wrong list samples from
the wrong pool.

`coach/guess-deck.js` writes one from the seeded builds and what they have
shown this game:

```bash
node coach/guess-deck.js state/state.json decks/theirs.txt
```

It refuses more often than it answers, on purpose. Fewer than three of their
shown cards in the best-fitting build, or two builds fitting equally well, and
it declines rather than picking — sampling their hand from the wrong deck is
worse than not ranking at all. A card they played that a build does not contain
counts twice as heavily against it as a match counts for, since staples appear
in everything and a surprise does not.

**Rollouts default to 1200** because that is what the measurement supports: on
the position this was built against, the top four options sat inside the noise
at 40, 150 and 400 rollouts and only separated at 1200. Five actions at that
count is about 80 seconds. Below roughly a thousand the ranker honestly reports
TOO CLOSE TO CALL, which is worse than slow. `RBC_ROLLOUTS` overrides it.

## Status

| Phase | State |
|---|---|
| 1 — Recon | Done. [`docs/phase1-recon.md`](docs/phase1-recon.md) |
| 2 — Protocol capture | **Skipped by design.** See below. |
| 3 — Extractor | Built. Tested against a synthetic board; **not yet run against the live site.** |
| 4 — Coaching layer | Built. Needs an OpenRouter key to run for real. |

## Why there's no WebSocket capture

The original plan was to tap the PartyKit socket. Reading the DOM turned out to
be strictly better for this project's main constraint.

Rift Atlas renders face-down cards as card backs — an opponent's hand is
anonymous elements in the markup, with no card code and no name. So reading the
DOM means hidden information is **structurally absent**, rather than present
and requiring us to discard it correctly. Tapping the socket would mean
receiving whatever the server sends for rendering and trusting ourselves to
strip it, with no way to verify we caught everything.

It also avoids automating a login, and it's the approach both existing public
Rift Atlas extensions took.

## Layout

```
extension/          MV3 content script — the extractor
  src/board.js        every DOM read; the only file that knows any selector
  src/visibility.js   the hidden-information boundary
  src/snapshot.js     assembles the structured state
  src/exhaust.js      probes for exhausted/readied (see Unknowns)
  src/discovery.js    attribute dump, for closing the remaining unknowns
  content.js          observes the board, posts snapshots
sidecar/server.js   local HTTP server: holds state, serves it on a port
coach/              the coaching layer
  summarize.js        snapshot -> the facts a coach reasons about
  cards.js            card text from RiftScribe, cached on disk
  prompt.js           what to ask for, and what not to speculate about
  openrouter.js       the API call
  index.js            the loop
docs/               recon notes, schema, sample snapshot
test/               39 tests over a jsdom board fixture
```

## Running it

See [SETUP.md](SETUP.md) for the step-by-step, including the console-only path
that needs no sidecar.

Start the sidecar:

```bash
npm run sidecar     # http://127.0.0.1:8787, loopback only
```

Load the extension:

1. `chrome://extensions` → **Developer mode** on
2. **Load unpacked** → select `extension/`
3. Open play.riftatlas.com and start a solo game

A small status line appears bottom-right. Then:

```bash
curl -s localhost:8787/state | jq        # newest snapshot
curl -s 'localhost:8787/history?n=5'     # the last five
cat state/state.json                     # newest, mirrored to disk
```

## Coaching

```bash
# macOS / Linux
export OPENROUTER_API_KEY=sk-or-...

# Windows, cmd.exe
set OPENROUTER_API_KEY=sk-or-...

# Windows, PowerShell
$env:OPENROUTER_API_KEY="sk-or-..."

node coach/index.js
```

[OpenRouter](https://openrouter.ai) is a gateway: one key and one bill across
many providers. The model is chosen by its slug, and the default
`anthropic/claude-sonnet-5` routes to Anthropic. Set `RBC_MODEL` to use
another — `anthropic/claude-haiku-4.5` is cheaper, `anthropic/claude-opus-5`
thinks harder. It is pay-as-you-go and needs credit on the account; a turn
costs roughly 1,500 tokens in and 250 out, so about half a cent on Sonnet 5.

It watches the sidecar and, when it is your turn, prints a line to the
terminal. Flags:

| Flag | |
|---|---|
| `--dry-run` | build and print the prompt, send nothing — no key needed |
| `--once` | coach the current state and exit |
| `--every` | coach on every change, not only your turns |
| `--compare` | ask several models the same turn, once, and print all answers |

### Which model

`anthropic/claude-sonnet-5` by default. Whether a bigger one earns its cost on
*this* prompt and *your* boards is not something to settle by argument, so:

```bash
node coach/index.js --compare
```

runs the same live turn through Haiku 4.5, Sonnet 5 and Opus 5 and prints all
three with their latency and how much of it was thinking, for about two cents.
`RBC_COMPARE` takes a comma-separated list to compare others.

Sonnet 5 and Opus 5 are reasoning models: they think before answering, and the
thinking comes out of the same token budget as the reply. `RBC_MAX_TOKENS`
(2000) is the budget. A budget too small for the thinking returns an empty
message, and the error says so rather than reporting no answer.

### How hard should it think?

`RBC_REASONING` defaults to `low`. **That is a guess, not a finding.**

The case for low: a turn has a clock, and the board handed to the model is
small and fully specified — there may not be much to think about.

The case against: the work that matters here is *arithmetic* — summing might at
a battlefield, checking what a rune spread can actually pay for — and getting
it wrong is the failure that matters most. Thinking is exactly what buys that.

Compare them on the same board rather than guessing, with `@effort` entries.
This is the default set, so `--compare` alone walks one model up the ladder:

```bash
set RBC_COMPARE=anthropic/claude-sonnet-5@none,anthropic/claude-sonnet-5@low,anthropic/claude-sonnet-5@medium,anthropic/claude-sonnet-5@high
node coach/index.js --compare
```

Efforts are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` — and
`default`, which sends no reasoning setting at all.

**`default` is not `none`.** An early comparison labelled a run "off" when it
was really sending nothing and letting the model choose: that run spent 2314
tokens thinking, while the run labelled "low" spent none. Two of its three
labels were wrong, and it was the "off" one that looked surprisingly good.
`none` now says none. An unrecognised effort is an error rather than a
silent fallback to the default, for the same reason.

One board cannot settle this. The models disagree most on quiet turns and
agree on obvious ones, so a single turn where they all say the same thing
tells you nothing. Run it on several turns, and weight the ones where you
had a real decision to make.

Reasoning tokens bill at the output rate, so effort costs real money — though
still cents. Per 40-turn session, at list prices:

| | none | low | medium | high |
|---|---|---|---|---|
| haiku-4.5 | $0.10 | $0.16 | $0.34 | $0.70 |
| sonnet-5 | $0.20 | $0.32 | $0.68 | $1.40 |
| opus-5 | $0.50 | $0.80 | $1.70 | $3.50 |

The thing to watch is whether high effort *counts better*, not whether it
writes better. If the numbers are right at `low`, the extra thinking is buying
prose.

What to look for: does it **count correctly** — ready runes, might, what you
can actually pay for — and does it commit to a line rather than listing
options. A model that reads the board right and says something obvious is more
useful mid-turn than one that reasons beautifully about a board it misread.

Card text comes from [RiftScribe](https://riftscribe.gg/api-docs) — free, no
key — and is cached in `state/cards.json`, so a match after the first is
almost entirely local.

### Archetype memory

There is no public meta or decklist API for Riftbound, and a hand-written meta
file would be invented rather than known. So the coach learns instead: every
public card an opponent commits to the board is recorded against their
champion, in `state/archetypes.json`.

Play against Jayce four times and the file knows what Jayce decks *in your pod*
are playing — grounded in what you actually face, improving on its own, with
nothing fabricated. ### Seeding a decklist

Waiting to face a deck four times is slow, so you can hand it a list:

```bash
node coach/seed.js --all decks/                              # read every list in the folder
node coach/seed.js decks/jayce-control.txt --name "Control"  # or one at a time
node coach/seed.js --list
node coach/seed.js --forget "Jayce, Brilliant Inventor"
```

**Putting a file in `decks/` does not read it.** Seeding is a command, not a
folder scan — run `--all` after adding lists, or name the file directly. With
`--all`, each file's name becomes its build name, so name the files the way you
want the builds named.

The filename doesn't matter, and you don't name the champion — it's read from
the list's own `Champion:` section. It takes the format Rift Atlas exports:

```
Legend:
1 Jayce, Defender of Tomorrow

Champion:
1 Jayce, Brilliant Inventor

MainDeck:
3 Promising Future
2 Garbage Grabber

Battlefields:
1 Dragon Roost

Runes:
7 Body Rune
5 Mind Rune

Sideboard:
2 Disposal Order
```

Sections are kept apart: main deck, battlefields, runes and sideboard each mean
something different to a coach. A plain one-card-per-line file still works and
is read as a main deck, and an unrecognised heading keeps its cards rather than
dropping them.

Every line is resolved against the card API, so a typo is **reported rather
than stored**. `Dredge Upp` is refused; `Dredge` is refused for matching two
cards. A card is treated as a **name plus every code it has been printed under**.
"Irelia, Fervent" appears in three sets (`SFD-057`, `SFD-225`, `VEN-174`), and
alternate arts and foils add more (`SFD-057a`, `SFD-225*`). Requiring one code
per card refused ordinary reprinted cards and would have failed to match a list
written with one printing against a board rendering another.

### Several builds per champion

A champion is not a deck. Irelia Heron and Irelia Protect-the-Queen share a
champion and little else, so builds are stored **separately and never merged** —
a prior saying "they might have any of these eighty cards" is not a prior.

Give each one a name:

```bash
node coach/seed.js decks/irelia-heron.txt  --name "Heron"
node coach/seed.js decks/irelia-ptq.txt    --name "Protect the Queen"
```

What makes several builds useful is that the game narrows them. Every public
card the opponent plays either appears in a build or doesn't, so the prompt
carries the evidence per build:

```
POSSIBLE BUILD "CONTROL" — NOT confirmed for this opponent:
  EVIDENCE THIS GAME: played so far and in this build: Clairvoyance, Mobilize
POSSIBLE BUILD "HERON" — NOT confirmed for this opponent:
  EVIDENCE THIS GAME: played so far and in this build: Mobilize;
                      played but NOT in this build: Clairvoyance
```

Reported as evidence, not a verdict. A card outside a build counts against it
without ruling it out — tech cards and sideboard swaps exist — and a card found
only in a build's sideboard is recorded as its own kind of evidence rather than
as an absence. The model is told to name which build it thinks you're facing
and how confident that is, or to say the matchup is still open and what would
tell them apart.

Seeded and observed cards also stay separate, because they are different
evidence: a decklist says what the archetype plays, a sighting says what *this*
opponent played. A seeded card that then shows up in a game moves to the
observed list, where the sighting outranks the list it came from.

### Equipment

The board renders gear as a separate card in the same zone as the unit it
modifies, with no marker tying them together. The pairing is read out of the
match log instead — `"Equipped Guardian Angel to Irelia, Fervent."` — and shown
as `Guardian Angel (ready, equipped to Irelia, Fervent per the log)`.

"Per the log" is load-bearing: this is inferred, not read off the board. A
pairing is dropped when the two cards are no longer in the same zone, which
catches the unit dying or the gear moving, and the latest line wins when gear
is re-equipped.

### Rules

`coach/rules.md` holds the game rules the coach must respect. It is injected
into the system prompt and is plain Markdown — correct it, extend it, no code
involved.

It exists because of a specific failure. Given an accurate board, all three
models recommended playing a unit straight onto a battlefield nobody
controlled — an illegal play. **The state was right; they didn't know the
rules.** That is the worst failure available here, because it reads as advice
and cannot be taken.

It is distilled from the **official Core Rules (RUP4, 2026-07-16)**, and every
rule carries its number — `806.3`, `144.4.a`, `469.1` — so any of them can be
checked against the source rather than taken on trust. Nothing is written from
memory: a plausible-sounding wrong rule does more damage than a missing one,
because the coach states both with the same confidence.

Everything after the `<!-- human-only` marker in that file — provenance, how
to extend it, what is missing — is **not** sent to the model. The system prompt
goes out on every turn of every game, so a paragraph of upkeep notes is a
paragraph paid for hundreds of times.

It covers where cards can be played, how units move, how control of a
battlefield is gained and lost, the two ways to score, and the rune economy.
Deliberately not the whole rulebook — timing minutiae would cost tokens on
every turn and bury the parts that decide what to do. The model is told the
file is incomplete and to say "if you can do X" rather than assume.

Consequences it now knows that it previously got wrong, each found by reading
its advice against the rules:

- With no units anywhere, **the only legal destination for a unit is your
  Base** — reaching a battlefield takes a second step. (806.3)
- **Units enter exhausted** (143.4), so a unit played this turn cannot move
  this turn — moving costs exhausting it, and it already is.
- **The champion in its zone is a card you can play** (108.3.d), not a label
  for who you are. It is listed under `CARDS YOU CAN PLAY THIS TURN` alongside
  your hand, and its card text is fetched like any other — putting it beside
  the player's score and legend was not enough, and it went unconsidered.
- **The legend has abilities** (174.6–174.8) and is a standing engine, not a
  nameplate. Its card text is fetched and its exhausted state reported, since
  activating an ability usually costs exhausting it. A legend that readies a
  unit is the difference between a body played this turn sitting idle and that
  same body reaching a battlefield.
- **Hide needs a battlefield you already control** (811.1.b), so on an empty
  board it is not an option however cheap it looks. A card in the Champion
  Zone can be hidden from there too, not only from hand.
- **A ready rune is worth 1 Energy or 1 domain Power, not both**, and the pool
  empties every turn, so floating resources cannot be banked. (164.2, 167)

### Lessons from finished games

Three kinds of knowledge, kept apart because they carry different weight:

| | source | strength |
|---|---|---|
| `coach/rules.md` | quoted from the rulebook | binding |
| `state/archetypes.json` | decks actually seen or seeded | evidence |
| `coach/lessons.md` | inferences from how games went | heuristic |

After a game:

```bash
node coach/review.js              # read the game, write what it taught
node coach/review.js --dry-run    # see the review prompt, send nothing
node coach/review.js --note "..." # record one lesson by hand
```

The hand-written form matters most. When the coach suggests something illegal
and you correct it, **that correction is ground truth** — better than anything
the model would infer. A rule belongs in `rules.md` with its number; a
judgement call belongs here.

Lessons are capped at 25 and deduplicated, so they cannot crowd out the rules
or the board, and the prompt tells the model they are heuristics that both the
rules and the live board override. Delete any that look wrong — a wrong lesson
is worse than none, because it gets read back later as knowledge.

### What the coach is told it cannot do

The prompt states that the opponent's hand is not visible and gives only its
size, and forbids naming or reasoning about specific cards in it. Reads are
meant to come from their trash, deck size, ready runes and what their deck has
already shown — the same things you can see.

That is belt-and-braces: their hand never reaches the prompt in the first
place, because the extractor withholds it. A test asserts a revealed hand card
appears nowhere in the built prompt.

The coach also re-checks the room mode and refuses anything but solo practice,
even though the extractor already refuses to capture it. The guard that matters
is the one nearest the thing being guarded.


## Checking the rule numbers

`coach/rules.md` gives a rule number for every constraint, and the system
prompt calls that section authoritative and binding. Two of those numbers were
wrong: `806.3` was cited for where a unit may be played (806 is the **Action**
keyword and says nothing about placement — the real rule is `355.2.a`), and
`174.6`–`174.8` for legend abilities (rule 174 does not exist; 170 is
Battlefields). A wrong number is worse than none: it reads as checkable, so
nobody checks it.

```bash
node coach/check-citations.js
```

Every citation is looked up in `rules/*.pdf` via `pdftotext`. Without poppler
installed it exits 2 and says the citations are *unverified* rather than
claiming a pass. `npm test` runs the same check and skips loudly.

## Solo-only, and why

`content.js` sets `coachLiveMatches: true`, so real matches are captured and
coached. The status pill says which kind of game it is — `live — turn 4` or
`practice — turn 4` — because a tool that behaves differently in a real match
should say when it is in one. Set it `false`, or run the coach with
`RBC_SOLO_ONLY=1`, to restore solo-only capture.

**This governs WHEN the pipeline runs, never WHAT it may see**, and the two
questions are easy to conflate. The opponent's hand is structurally absent
from a snapshot rather than filtered out of one: `REVEALS_BOTH_HANDS` widens
only for `solo_lab`, where both seats are yours, and
`test/visibility.test.js` asserts the opponent's hand is never readable in a
real match, face-up or not. The extractor reads your hand, the public board
and your own runes — the same things a screenshot of your screen shows.

What it is is real-time assistance, and that is a different question from
information access. `docs/phase1-recon.md` records what was found of Rift
Atlas's terms: "You may not use the site in a way that damages the service,
interferes with other users, bypasses access controls, attempts unauthorized
access, or violates applicable law." No clause specifically addressing
automation surfaced, **and the terms were never read in full** — the page
could not be fetched during recon and the follow-up never happened. Whether
live coaching is within them is the operator's call to make, on their own
account, and it is worth making deliberately rather than by default.

## What this is not

Not affiliated with, endorsed by, or connected to Riot Games or Rift Atlas.
Rift Atlas is itself an unofficial fan project operating under Riot's "Legal
Jibber Jabber" policy; this is a third party to a third party.

Selectors here depend on Rift Atlas's markup, which will change without notice.
When it does, only `extension/src/board.js` needs updating.

## Unknowns

`exhausted` is not yet readable — no public source reads it and the live site
was unreachable from where this was written. It reports `null`, meaning
*unknown*, never *readied*, and every snapshot says so in `fieldsUnread`.
Might/power, energy, rune readiness and battlefield identity aren't extracted
at all yet.

Run `rbcDiscover()` in the page console on a live board to dump the attribute
surface; that's what closes these. See
[`docs/state-schema.md`](docs/state-schema.md#unknowns--what-still-needs-a-live-board).

## Tests

```bash
npm test
```

They run against a synthetic board built to the documented markup — which makes
them a test of the extractor's logic, not proof that the selectors match the
live site. The visibility guarantees are the part worth reading:
`test/visibility.test.js`.
