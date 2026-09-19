# Snapshot schema v1

One snapshot is emitted per authoritative game action. A worked example is in
[`samples/snapshot.json`](samples/snapshot.json).

## Top level

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1` |
| `capturedAt` | ISO 8601 string | when the snapshot was taken |
| `sequence` | string \| null | the board's `data-authoritative-sequence` — the server's own action counter |
| `match` | object | match-level facts |
| `players` | object | `self` and `opponent` blocks |
| `zones` | object | `self` and `opponent`, each holding the six zones |
| `log` | array | match log, oldest first, capped to the last 40 by default |
| `fieldsUnread` | string[] | fields the board did not expose this snapshot |
| `warnings` | string[] | anything the consumer should know before trusting the state |

`sequence` is the deduplication key. Two snapshots with the same `sequence`
describe the same game state.

## `match`

| Field | Type | Notes |
|---|---|---|
| `roomCode` | string \| null | |
| `phase` | string \| null | `in_game` while a match is live |
| `mode` | string \| null | |
| `turnNumber` | number \| null | |
| `activeSide` | `"self"` \| `"opponent"` \| null | |
| `isMyTurn` | boolean \| null | **null means unknown, not "their turn."** |

## `players.<side>`

`name`, `score` (the game is to 8), `legend`, `champion`. Every field is
nullable; null means the board did not say.

## `zones.<side>.<zone>`

Zones: `hand`, `base`, `battlefieldA`, `battlefieldB`, `runeArea`, `trash`.

| Field | Type | Meaning |
|---|---|---|
| `count` | number | how many cards are in the zone |
| `visible` | card[] | the ones whose identity we may carry |
| `hiddenCount` | number | how many were withheld |

`count === visible.length + hiddenCount` always holds, and is asserted in the
tests.

### Card

| Field | Type | Notes |
|---|---|---|
| `cardId` | string \| null | the board's own element id; stable within a match |
| `faceDown` | boolean | |
| `code` | string \| null | e.g. `OGN-004`; null when face-down, and for tokens |
| `name` | string \| null | localised — prefer `code` for lookups |
| `exhausted` | boolean \| null | **see Unknowns** |

## The visibility rule

Stated once, because it is the point of the project:

> A card's identity is carried only when the client drew it face-up.
> How many cards sit in a zone is carried always.

The count is deliberately public. You can see your opponent holding five cards,
and a coach that doesn't know it gives bad advice. What those cards *are* never
leaves the browser unless the client rendered them face-up.

Reading the DOM is what makes this cheap to guarantee: Rift Atlas draws card
backs for anything a player may not see, so an opponent's hand arrives as
anonymous elements with no code and no name. There is nothing to filter out,
because nothing was ever there.

Three things are enforced on top of that, so the guarantee doesn't rest on the
site continuing to behave:

1. **Your own face-down cards stay hidden from you too.** An unflipped rune on
   your side is withheld, because the client is telling us it hasn't revealed
   it to you either.
2. **The opponent's hand is treated as private regardless of what was drawn.**
   A face-up card there is withheld *and* a warning is emitted. This costs a
   little: an opponent revealing a card from hand as a cost is information
   you're entitled to, and it is dropped. That's the trade this project asked
   for, and it errs in the only direction worth erring in.
3. **Every snapshot is audited before it is emitted.** `visibility.audit()`
   re-checks the assembled object and a snapshot that fails is replaced with an
   error rather than sent. It should never fire; that's exactly why it runs
   every time rather than once.

## Unknowns — what still needs a live board

These could not be confirmed, because the environment this was written in
cannot reach `play.riftatlas.com` and no public source reads them.

### `exhausted` — not yet readable

The stats tracker never needed exhaustion, so its source says nothing about how
the site marks one. `extension/src/exhaust.js` probes the markers such a board
plausibly uses — `data-exhausted`, `data-state="exhausted"`, a rotation class —
and answers **`null` when none is present**.

**`null` means "could not read", not "readied."** A coach told a blocker is
ready when it is exhausted gives worse advice than one told nothing. While the
field is unread, `fieldsUnread` contains `"exhausted"` and a warning is
attached to every snapshot.

To close it: open a board with something exhausted and run `rbcDiscover()` in
the console. The output names the attribute that differs. One real rule then
replaces the three guesses.

### Not yet extracted at all

- **Might / power** on units — location unknown.
- **Energy** and per-turn resource availability.
- **Rune readiness** — which runes are spent vs available. The `runeArea` zone
  is read, but "open runes" in the sense the coach needs (what tricks they can
  still hold up) depends on the exhaustion marker above.
- **Battlefield identity and conquest state** — `battlefieldA`/`battlefieldB`
  are read as card containers, but which battlefield they are, and who is
  contesting them, is not yet parsed. The match log carries conquests as text
  in the meantime.

`rbcDiscover()` is the tool for all of these. It dumps attribute *names* and
`data-*` values on card elements, omitting `alt` and `src`, so its output is
safe to paste into a chat without handing over anyone's hand.
