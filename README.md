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
| 4 — Coaching layer | Not started. |

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
