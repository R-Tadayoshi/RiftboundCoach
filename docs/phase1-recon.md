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
