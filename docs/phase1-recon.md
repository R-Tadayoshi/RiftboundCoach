# Phase 1 — Recon findings

Date: 2026-09-19

## 1. Is RiftAtlas open source?

**No.** There is no public source repository for RiftAtlas / play.riftatlas.com.
The author does maintain a build diary at `how-i-build.riftatlas.com`, but the
application source is closed.

Other Riftbound simulators on GitHub (`pipps42/rift-sim`, `chorlick/alpharune`,
`samelliottdlt/riftbound-simulator`, `Mercantec-GHC/riftbound-tcg`) are
**unrelated projects**, not RiftAtlas. They are not useful for reading
RiftAtlas's protocol.

## 2. Architecture

From the author's build diary (via search indexing):

- Originally built on **Convex** (database + backend functions + realtime sync
  in one system, WebSocket transport, end-to-end TypeScript).
- **Live matches have since migrated to PartyKit**, each match being a room
  running on a **Cloudflare Worker backed by a Durable Object**. The stated
  motivation was Convex infrastructure cost as the game grew.
- Auth is behind a sign-in wall (`play.riftatlas.com/sign-in?redirect_url=…`,
  a Clerk-style redirect parameter).

So the transport is WebSocket, terminating at a PartyKit room
(`/parties/<party>/<room>` is the PartyKit convention), not HTTP polling.

## 3. Prior art — two public, read-only extensions

Both target `play.riftatlas.com` and both read the **DOM**, not the WebSocket.

### `mcmikey123/riftatlas-tracker` — "Rift Atlas Stats Tracker" (the useful one)

A mature MV3 extension that records matches locally. Manifest is
`host_permissions: ["https://play.riftatlas.com/*"]`, content scripts at
`document_idle`. Describes itself as "Passive observer - never plays for you."

It has already reverse-engineered the board markup. Selectors below are lifted
from its `capture/board-read.js` and `capture/deck-cards.js`.

### `Zaious/riftatlas-companion`

Smaller; a lobby panel. Reads `localStorage["riftbound_simulator_last_room"]`
and card image URLs. States explicitly: "It does not press any Rift Atlas button
for you, modify game state, or automate any part of play."

## 4. The board markup (confirmed, from tracker source)

### Root element

`[data-testid="game-state"]`, carrying dataset attributes:

| Attribute | Meaning |
|---|---|
| `data-room-phase` | lobby / `in_game` / etc. |
| `data-room-mode` | match mode |
| `data-turn-number` | current turn |
| `data-active-player-id` | whose turn it is |
| `data-viewer-player-id` | **me** |
| `data-opponent-player-id` | them |
| `data-viewer-score` | my score (game is to 8) |
| `data-opponent-score` | their score |
| `data-authoritative-sequence` | **bumps on every authoritative game action** |

`data-authoritative-sequence` is the change-trigger to build on — one scrape per
real game event, rather than polling on a timer.

### Zones

Selector shape: `[data-drop-zone-root="<zone>"][data-zone-owner="self"|"opponent"]`

Known zones: `battlefieldA`, `battlefieldB`, `base`, `hand`, `trash`, `runeArea`,
plus `legend` and `champion` (addressed via `[data-drop-zone="…"]`).

Cards within a zone: `[data-card-id]`, each containing an `img[alt]`.

### Card identity

Card code is extracted from the image URL, not the name (names don't survive
localisation):

```
/\/cards\/[^/]+\/([A-Za-z0-9]+-[A-Za-z0-9]+)\.webp/
```

giving codes like `OGN-004`, `UNL-199`. Tokens are served from a different path
and yield no code.

### Hidden information — the key finding

Face-down cards are rendered with alt text matching:

```
/hidden card|card back|rune back/i
```

**The client renders what the player may see.** An opponent's hand is card
backs in the DOM. This matters for the project's constraint: reading the DOM
means hidden information is *structurally absent*, rather than present and
requiring us to discard it correctly.

### Other readable state

- Room code: `[data-testid="room-code"]` → `data-room-code`
- Player names: `[data-player-identity-trigger="player"|"opponent"]`, name in
  `aria-label` as `"<name> menu"`
- Score tracks (fallback): `[role="group"][aria-label="Your score track"]` /
  `"Opponent score track"`; current node is `[data-active="true"]`, value in
  its `aria-label` (`"Set your score to 4"`)
- Match log: `ul li` rows; each has a coloured actor bar —
  `rgb(120,221,183)` = me, `rgb(255,187,110)` = opponent, neither = system.
  Panel renders newest-first.

Warning from the tracker's own source: class names on this site are generated
utilities with colour values baked in, rewritten on every restyle. Only the
`data-*` attributes and ARIA labels are stable enough to build on.

## 5. Card data APIs

`rift.tools` is a community **directory**, not an API. The actual card APIs:

- **RiftScribe** — `riftscribe.gg/api-docs`. Free, public, no authentication.
  The best default.
- **Riftcodex** — `riftcodex.com`, open REST API.
- **Scrydex** — `scrydex.com/docs/riftbound/cards`.
- **Official Riot** — via the Riot Developer Portal, requires authorisation.

Card codes scraped off the board (`OGN-004`) are set-prefixed and should resolve
against these directly.

## 6. Terms of service

`riftatlas.com/terms-of-service` could not be fetched from this environment
(see blockers). From search indexing, the operative sentence is:

> You may use Rift Atlas for personal, informational, and community purposes.
> You may not use the site in a way that damages the service, interferes with
> other users, bypasses access controls, attempts unauthorized access, or
> violates applicable law.

No clause specifically addressing automation or scraping surfaced. **This needs
to be read in full directly before Phase 3**, along with `robots.txt`, which
could not be retrieved.

Rift Atlas is itself an unofficial fan project operating under Riot's "Legal
Jibber Jabber" policy. Anything built here is a third party to a third party.

## 7. Blockers in this environment

The session's egress proxy returns **403 (policy denial)** for:

`play.riftatlas.com`, `riftatlas.com`, `www.rift.tools`, `riftscribe.gg`,
`riftcodex.com`, `scrydex.com`, `openrouter.ai`, `how-i-build.riftatlas.com`,
`en.wikipedia.org`

Only `github.com` / `raw.githubusercontent.com` are reachable.

Consequences:

- Phase 1 steps 2–4 (fetch the site, read its JS bundles, observe the socket,
  query rift.tools) **cannot be performed here**. The markup findings above
  come from the tracker's source instead, which is why they are as complete as
  they are.
- **Phase 2 cannot run here at all.** Playwright in this container reaches the
  network through the same proxy.
- **Phase 4 cannot run here** — OpenRouter is blocked.

Code can be written and tested here; it has to be *run* on the user's own
machine, or the environment's network policy has to be widened.

---

# Phase 1 — verified against the live site

Date: 2026-09-19, after the environment's egress policy was widened.

Everything above was inferred from other projects' source. This section is what
the site itself says.

## robots.txt

`play.riftatlas.com/robots.txt` allows `/` but disallows, among others:

```
Disallow: /api/
Disallow: /game
Disallow: /game/
Disallow: /sign-in
```

**`/game` — the match path — is disallowed to automated agents.** This does not
restrict a person browsing to their own match, nor an extension running in
their browser while they play; robots.txt governs crawlers. It does mean no
automated navigation to a match from this environment, which is why the
remaining markup questions are answered with `rbcDiscover()` in the user's own
browser rather than by driving a headless browser here.

The point is close to moot in practice: the board only exists inside an
authenticated live match, so there is nothing at `/game` for an unauthenticated
fetch to read anyway.

## Terms of service

Read in full. It contains no clause addressing automation, scraping, bots,
browser extensions, reverse engineering, or third-party tools. The only
operative restriction is the general one:

> You may not use the site in a way that damages the service, interferes with
> other users, bypasses access controls, attempts unauthorized access, or
> violates applicable law.

A passive read-only extension in your own browser during solo play engages none
of those. "Interferes with other users" is the clause that would bear on live
coaching in a match against a human, which is why the extractor is solo-only.

## Stack, confirmed

- **Next.js with Turbopack**, chunks under `/_next/static/immutable/chunks/`
- **Clerk** for auth, served from `clerk.riftatlas.com`
- **Convex** still present in the client bundle (`*.convex.cloud`), alongside
  the PartyKit migration the build diary describes
- Card art from `assets.riftatlas-workers.com/riftbound/cards`

## Board markup, confirmed from the site's own bundle

The `game-state` element is rendered with exactly these attributes:

```js
"data-testid": "game-state",
"data-room-mode": roomMode ?? "multiplayer",
"data-room-phase": phase,
"data-turn-number": turnNumber ?? "unknown",
"data-active-player-id": activeTurnPlayerId ?? "unknown",
"data-active-player-seat": seat,
"data-authoritative-sequence": authoritativeSequence ?? "unknown",
"data-authoritative-reset-token": lastAuthoritativeReset?.token ?? "unknown",
"data-viewer-player-id": self.id,
"data-viewer-score": self.board?.score ?? "unknown",
"data-opponent-player-id": opponent?.id ?? "unknown",
"data-opponent-score": opponent?.board?.score ?? "unknown"
```

Two elements alongside it:

- `[data-testid="turn-step"]` → `data-turn-step`
- `[data-testid="realtime-status"]` → `data-status`, one of
  `idle | connecting | open | closed | error`

### The `"unknown"` sentinel — a correctness bug this found

The board fills an attribute it cannot answer with the **literal string
`"unknown"`** rather than omitting it. Nine such defaults appear in the bundle.

This broke the solo-only guard in exactly the wrong direction: `"unknown"` is a
non-empty string, so an empty seat read as a seated opponent and capture would
have paused during the goldfishing the extractor exists for. Every attribute
read now rejects the sentinel. Regression tests: `test/snapshot.test.js`.

### Card art URLs — a second correctness bug

Card `imageUrl` values in the bundle are **flat**:

```
imageUrl: "/cards/OGN-004.webp"
imageUrl: "/cards/VEN-160.webp"
```

served from `https://assets.riftatlas-workers.com/riftbound/cards`, optionally
behind a size-variant segment (`small-v2`, `original`).

The regex inherited from the stats tracker required *two* path segments after
`/cards/` and would have matched **nothing**, silently returning `null` for
every card code. Now accepts both shapes.

Card backs are `cardback-{black,blue,white}.png` under `/riftbound/static/`,
used as a second opinion on face-down alongside the localised alt text.

### Exhaustion

`exhausted` is confirmed as the state field name (175 occurrences), with
mutations `toggle_exhausted`, `set_rune_exhausted`, and a `exhaustedCardIds`
collection. **The DOM attribute it renders to is still unknown** — the card and
zone components live in chunks loaded only on the authenticated game route.

Likewise unconfirmed: `data-card-id`, `data-zone-owner`, `data-drop-zone-root`.
These come from the stats tracker's source and are not present in the
landing-page chunks. They may be current, or the tracker may be out of date —
its own README warns the markup changes. **`rbcDiscover()` on a live board
settles it.**

## Card data API — working

`https://riftscribe.gg/api/cards/<CODE>` resolves RiftAtlas codes directly, no
auth, no key:

```json
{
  "name": "Cleave",
  "type": "Spell",
  "domains": ["Fury"],
  "stats": { "energy": 1, "might": null, "power": null },
  "description": "[Action] (Play on your turn or in showdowns.) Give a unit [Assault 3] this turn.",
  "keywords": ["action"]
}
```

Note `stats` carries energy cost and base might/power, so those do **not** need
scraping from the board — only modified in-play values would. That removes most
of the reason to hunt for might in the DOM.

The `/api/v1/...` paths 404; the working prefix is `/api/`.
