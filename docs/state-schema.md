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
| `connection` | object | how the snapshot was obtained, not what it says |
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
| `turnStep` | string \| null | which step of the turn, off `[data-testid="turn-step"]` |
| `activeSide` | `"self"` \| `"opponent"` \| null | |
| `activeSeat` | string \| null | |
| `isMyTurn` | boolean \| null | **null means unknown, not "their turn."** |

## `connection`

| Field | Type | Notes |
|---|---|---|
| `state` | string \| null | `idle` / `connecting` / `open` / `closed` / `error` |
| `resetToken` | string \| null | changes when the server replaces authoritative state wholesale; across a change, sequence numbers no longer compare |

Anything other than `open` means the board may be stale, and a warning saying
so is attached to the snapshot.

### Room modes and the solo guard

| `data-room-mode` | What it is | Coaching |
|---|---|---|
| `single_player` | Goldfish, no opponent seated | allowed |
| `solo_lab` | Two-Sided Practice, both seats yours | allowed |
| `multiplayer` | a real match | **paused** |

`solo_lab` seats a real opponent id and a real opposing board, so a check for
"is someone across the table" reads it as a live match and pauses — wrong, and
wrong where most of the tool's value is. The mode is what distinguishes it.

An unrecognised mode with someone seated is refused rather than allowed: a new
mode name should cost a pause and a question, not a silent coaching session in
somebody else's game.

### The `"unknown"` sentinel

The board fills an attribute it cannot answer with the literal string
`"unknown"` rather than omitting it. Every read rejects it, so an empty seat
does not read as a seated opponent and `"unknown"` does not read as a turn
number. This is not cosmetic — it broke the solo-only guard in the direction
that would have paused capture during goldfishing. See
[`phase1-recon.md`](phase1-recon.md#the-unknown-sentinel--a-correctness-bug-this-found).

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
| `index` | number \| null | position within the zone, off `data-drop-index` |
| `faceDown` | boolean | from `data-face-down`, falling back to the art path and alt text |
| `code` | string \| null | e.g. `OGN-004`; null when face-down, and for tokens |
| `name` | string \| null | localised — prefer `code` for lookups |
| `exhausted` | boolean \| null | from `data-exhausted`. `null` is *unknown*, never *readied* — a card in hand legitimately reads null, since it carries no exhaustion |

## Proven against a live board

Two-Sided Practice reveals both hands outright; the board captions it
**"OPPONENT HAND REVEALED"**. So the live capture from room 3SUWS is the exact
case this design was chosen to survive — the client handing over four opponent
hand cards, face-up, with codes and names attached.

What came out:

```json
"opponent": { "hand": { "count": 4, "visible": [], "hiddenCount": 4 } }
```

plus four warnings naming each withheld card. No code or name from that hand
appears anywhere in the snapshot, while the opponent's base, runes and trash —
all genuinely public — came through intact.

Every zone count in that capture matches the board exactly. Pinned by
`test/visibility.test.js`.

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

## How a card is read

Confirmed against a live board (goldfish, room YR6KC, turn 3).

A card is rendered as a nest of elements, **two or three of which repeat the
same `data-card-id`**: a hover-preview anchor, the drawn card button, and in
hand a further wrapper. Reading every `[data-card-id]` counted one card two or
three times — the first live capture reported 12 cards in a hand holding 4, 11
in a base holding 5, and 10 runes where 5 were on the table.

So elements are grouped by `data-card-id` and one is chosen per card, preferring
`[data-board-card-visual="true"]` — the card button, and the element that
carries `data-exhausted` and `data-face-down`.

Zones also contain **furniture with a `data-card-id`** but no card:
`base-area-marker:<playerId>` and `battlefield-marker:battlefieldA|B`. These
have no image, so they were being counted as face-down cards — an empty base
reported one hidden card. They are excluded by id.

### Attributes on the card button

| Attribute | Use |
|---|---|
| `data-card-id` | identity within the match |
| `data-drop-zone` | which zone it is in |
| `data-drop-index` | position within the zone |
| `data-board-card-visual` | marks the real card element |
| `data-visual-owner` | `self` / `opponent` |
| `data-exhausted` | `true` / `false`; absent in hand |
| `data-face-down` | `true` / `false` |

Zone containers carry `data-drop-zone-root` and `data-zone-owner`; the zones
present on a live board are `battlefieldA`, `battlefieldB`, `runeArea`, `base`,
`hand`, `trash`, `champion`, plus `legend` as a drop zone.

Tokens (Gold, and the like) are served from a different path, so they carry a
`name` but `code` is null. That is correct — they were never cards in a deck.

## Still unknown

- **Might / power modified in play.** Base values come from the card API
  (`stats.energy`, `stats.might`, `stats.power`), so only in-play modifications
  would need the board, and nothing in the capture showed where they live.
- **Energy / power pool.** The board displays `FLOATING — Energy / Power` in the
  bottom-left; the attribute behind it has not been located.
- **Battlefield identity.** `battlefieldA` / `battlefieldB` are read as card
  containers, but which battlefield each one *is* (e.g. "Rockfall Path") and
  who is contesting it are not parsed. The match log carries conquests as text
  in the meantime.
- **How a real opponent's hidden hand renders.** Not yet seen, because neither
  solo mode hides anything: a goldfish has no opponent, and Two-Sided Practice
  reveals both hands. Only a true two-player match settles it. Not blocking —
  see below.

`rbcDiscover()` (Ctrl+Shift+D) is the tool for all of these.
