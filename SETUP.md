# Running it on your machine

Everything here runs on **your** computer, not in the Claude session. The
extension lives in your Chrome; the sidecar is a small Node process beside it.

## For the first capture, you don't need the sidecar at all

The two console helpers are read-only and post nowhere. That's all I need to
work out the selectors, and it skips every setup step below except loading the
extension.

```bash
git clone -b claude/sweet-cerf-w3qtil https://github.com/R-Tadayoshi/RiftboundCoach.git
cd RiftboundCoach
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the **`extension/`** folder inside the
   folder you just cloned — not the top-level folder
4. Open play.riftatlas.com and start a game
5. Press F12 for the console and run:

```js
rbcDiscover()    // attribute surface — what the board actually carries
rbcSnapshot()    // the state as it would be captured, without sending it
```

Right-click the result → **Copy object**, and paste it back to me.

`rbcDiscover()` omits `alt` and `src`, and `rbcSnapshot()` runs the same
visibility filter as a real capture, so neither output contains card
identities you shouldn't be sharing.

## The sidecar, when you want the running feed

Only needed once we're capturing continuously — for Phase 4, not for working
out the markup.

It has **no dependencies**: Node's standard library only. If you have Node
installed ([nodejs.org](https://nodejs.org), any version 18+):

```bash
cd RiftboundCoach
node sidecar/server.js
```

That's it — `npm install` is only needed to run the tests. Leave it running in
its own terminal window; it prints a line per snapshot.

Check it from a second terminal:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/state          # add | jq if you have jq
```

The newest snapshot is also mirrored to `state/state.json` in the repo folder,
so you can just open that file if curl is awkward.

The sidecar binds to `127.0.0.1` only. Nothing it holds is reachable from
outside your machine, and it sends nothing anywhere.

## Where things can go wrong

**"Load unpacked" is greyed out** — Developer mode isn't on.

**No status line appears bottom-right on the game page** — the extension didn't
load, or you selected the wrong folder. `extension/manifest.json` must be
directly inside the folder you picked.

**`rbcDiscover is not defined`** — the content script didn't run. It only
matches `https://play.riftatlas.com/*`; check you're on that host, and reload
the tab after loading the extension.

**Status says "sidecar not running"** — expected until you start it. Capture
still works; it just has nowhere to post.

**Status says "paused — a second player is seated"** — the solo-only guard.
Expected in a two-tab match. The console helpers still work; see below.

## Two-tab matches

`soloOnly` stops snapshots reaching the sidecar when someone is across the
table. You do **not** need to turn it off to help me work out the markup —
`rbcDiscover()` and `rbcSnapshot()` both work regardless, because that guard
gates the coaching pipeline, not what you can read off your own screen.
