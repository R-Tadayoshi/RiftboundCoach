# Riftbound Coach

A live game-state extractor for [Rift Atlas](https://play.riftatlas.com), built
to feed an LLM coach during **solo practice**.

It reads the board the way a screenshot would — passively, through the DOM —
and hands a structured snapshot to a local process. It never clicks, drags, or
writes to the page.

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
export OPENROUTER_API_KEY=sk-or-...
node coach/index.js
```

It watches the sidecar and, when it is your turn, prints a line to the
terminal. Flags:

| Flag | |
|---|---|
| `--dry-run` | build and print the prompt, send nothing — no key needed |
| `--once` | coach the current state and exit |
| `--every` | coach on every change, not only your turns |

`RBC_MODEL` picks the model (default `anthropic/claude-sonnet-4.5`).

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
node coach/seed.js "Jayce, Brilliant Inventor" decks/jayce.txt
node coach/seed.js --list
node coach/seed.js --forget "Jayce, Brilliant Inventor"
```

The file is read the way decklists are written — one card per line, optional
count, `#` comments ignored. Codes and names both work:

```
3 Dredge Up
2 OGN-099
Platewyrm Egg
```

Every line is resolved against the card API, so a typo is **reported rather
than stored**. `Dredge Upp` is refused; `Dredge` is refused for matching two
cards. Nothing invented gets in.

Seeded and observed cards stay separate in the prompt, because they are
different evidence. A decklist says what the archetype plays; a sighting says
what *this* opponent played. Seeded cards are labelled "NOT confirmed for this
opponent — they may be on a different build", and a seeded card that then shows
up in a game moves over to the observed list, where the sighting outranks the
list it came from.

Only public cards are learned — base, battlefields, runes and trash. A hand is
never learned, because it was withheld before this layer saw it. Runes are
skipped, since every deck of a domain runs them.

The prior enters the prompt labelled as a prior, with its sample size
(`seen in 2 of 4`), and the model is told to say "they have shown X before",
never "they have X" — and that this game's board overrides it. A prior is not
read from the current game before it is used, so a card first seen a moment ago
is not handed back as if history had established it.

### Equipment

The board renders gear as a separate card in the same zone as the unit it
modifies, with no marker tying them together. The pairing is read out of the
match log instead — `"Equipped Guardian Angel to Irelia, Fervent."` — and shown
as `Guardian Angel (ready, equipped to Irelia, Fervent per the log)`.

"Per the log" is load-bearing: this is inferred, not read off the board. A
pairing is dropped when the two cards are no longer in the same zone, which
catches the unit dying or the gear moving, and the latest line wins when gear
is re-equipped.

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

## Solo-only, and why

`content.js` sets `soloOnly: true`. When a second player is seated, capture
pauses.

The extractor is for goldfishing. Live advice in a real match is assistance the
other player doesn't have and didn't agree to, and Rift Atlas's terms ask users
not to interfere with other users. The guard lives in the extractor so nothing
downstream can quietly opt out of it. Flip it knowing what you're flipping.

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
