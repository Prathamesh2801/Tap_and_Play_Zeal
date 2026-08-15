# Tap & Play

React 19 + Vite 8 + Tailwind 4 SPA. Two surfaces bound by a **system number** (`SYS_NO`),
talking to a small PHP backend over SSE.

- **Screen** `#/screen/:sysNo` — a 720 × 1480 portrait panel. Read-only, chrome-free.
- **Controller** `#/controller/:sysNo` — a phone. Writes only.

```
 controller ──POST data.php──►  PHP  ──SSE sse.php──►  screen ×10
      ▲                          │
      └────────SSE sse.php───────┘
```

```bash
npm install
npm run dev      # vite, host: true (LAN-exposed so a phone can be the controller)
npm run build
npm run lint
```

## Testing without the PHP host

Two mocks. **Pick by how many browsers are involved** — this is the thing that
catches people out.

### One browser, several tabs → `config.devMock.enabled = true`

[src/lib/mockBackend.js](src/lib/mockBackend.js) fakes the backend inside the page.
Nothing to run.

> **Hard limit:** it uses `BroadcastChannel` + `localStorage`, both scoped to **one
> browser profile on one origin**. Chrome cannot see Edge. No other machine can see
> either. And `http://localhost:5173` cannot see `http://localhost:5174` — if Vite
> falls back to a second port because something already holds the first, two tabs on
> different ports are two different origins and will never talk. Tabs of the same
> browser at the same `host:port` is the entire reach.

### Two browsers, two machines, or ten screens → `npm run mock`

[scripts/mock-server.mjs](scripts/mock-server.mjs) — Node, zero dependencies, speaks
the real wire contract over HTTP on port 4000.

```jsonc
// src/lib/config.js
devMock: { enabled: false, … },
apiBaseUrl: "http://192.168.x.x:4000",   // LAN IP, NOT localhost
```

The app then uses a genuine `EventSource` and genuine POSTs — the same code path as
against the PHP. This is the one to use for anything resembling the real wall.

Verified against the contract: multipart writes, `Invalid System Number.`,
`Data are missing.` on a partial write, `: heartbeat` comment lines, CORS preflight,
and sync params containing `&` surviving the round trip.

### Both mocks are slow on purpose

Each connection draws a **fixed** random lag (600–1100ms, matching the real server's
poll spread) and keeps it for the life of the connection. An instant mock would make
broken sync look perfect — every screen would start together and prove nothing. With
the spread in, four screens receive Restart up to half a second apart and must still
land on the same frame. That is the actual test.

### Either way

- Only two seams divert: `createSystemStream`/`validateSystemNo` in `sseClient.js`,
  and the single `write()` in `apiClient.js`. **The hooks, the clock, the blob cache
  and the sync maths run the exact production code** — this tests the app, not a
  lookalike.
- `devMock.systems` / `MOCK_SYSTEMS` list the admitted SYS_NOs (1–10 by default), so
  the setup gate's rejection path stays testable.
- An amber **DEV MOCK** badge sits bottom-left while the in-browser mock is on, with
  a reset button. It renders nothing when the flag is off. It exists because the
  failure it guards against — commissioning a wall with the mock still enabled —
  looks exactly like a healthy system that never hears from the controller.

What to check: pick a clip → every screen starts together; pause → no backwards
jump; restart → simultaneous; reload a screen → it rejoins mid-loop already in step,
from cache rather than the network. `?debug=1` shows preload state and live drift.

## The deployment this is built for

**Read this before changing anything in `src/lib/` or `src/components/screen/`.**
Every non-obvious decision in the codebase traces back to one of these facts:

- **Ten screens, one wall, playing the same clip in visible step.** Any two panels
  side by side must not show different frames. This is the hard requirement.
- **Fully offline.** A local router, an Apache/PHP host on a LAN IP
  (`config.apiBaseUrl`), and ten browsers. No internet, no CDN, no HTTPS.
- **No HTTPS means no secure context**, which means `caches` (Cache Storage),
  service workers, and everything else gated on it are **absent at runtime**.
  Code may reference them, but must never depend on them — see `videoCache.js`.
- **The router is the bottleneck.** Ten panels pulling video at once through one
  consumer access point is the failure mode. Playback must never touch the network.
- **The panels are cheap.** Assume a signage stick that can just barely decode
  720p24. A screen that can't keep up falls behind, and the sync code deliberately
  refuses to correct a starved pipeline rather than turn a slow screen into a
  stuttering one — so decode headroom is bought at encode time, not at runtime.

## The four ideas that make it work

### 1. Video is bundled, never fetched on demand

`config.bundledVideos` imports the clips from `src/assets/video/`, so Vite hashes
them into the build. The controller sends `local:v1` — a name, not a URL. The wire
carries a few bytes; the video never crosses the network at play time.

### 2. Every screen downloads every clip before anything is asked for

`ScreenRoute` preloads the whole library the moment the screen binds to a system,
**one file at a time** (`for … await`). Sequential is deliberate: ten screens each
pulling both files in parallel through one router is the slowest path to all-ready,
and it leaves every screen half-cached instead of the first clip cached everywhere.

`videoCache.js` fetches to a `Blob` and hands `<video>` an object URL. `preload="auto"`
is a hint browsers throttle; a blob removes the network from playback entirely, so
seeking and looping are memory operations.

### 3. Position is a function of the clock, not of when the message arrived

The core of `SyncedVideo.jsx`:

```
target = ((now() - anchor) / 1000) mod duration
```

`anchor` is an instant stamped into the media URL as `?t=`. Nothing is triggered by
the Play event landing, so the server's **0.6–1.1s poll delay and its per-screen
spread stop mattering** — the event decides *whether* it plays, never *where*. A
panel that boots twenty minutes late computes the same target as the other nine and
joins mid-loop already in step.

An anchor in the **future** is a scheduled start: the element holds its first frame
until that instant. That is what Restart is — `config.sync.restartLeadMs` (2.5s) is
chosen to clear the worst-case delivery so all ten are holding the instruction
before the moment it names.

### 4. `now()` is server time, not device time

`clock.js`. Windows NTP drifts seconds; ten screens can only agree on a position if
they agree on the time. Each screen measures its offset from the web server by
polling `HEAD` every ~25ms and watching for the instant the `Date` header *ticks
over* — that turns a 1-second-resolution header into a sub-frame reference.

**Never call `Date.now()` for anything sync-related. Always `now()` from `clock.js`.**

`Date` is not CORS-safelisted, so this only works same-origin — i.e. the built app
must be served from the same Apache host as the PHP. In dev it falls back to the
local clock, which is correct anyway when every "screen" is one machine.

## Invariants — breaking these breaks the wall

| Rule | Why |
| --- | --- |
| Sync state rides in the URL as `?t=` / `?p=` | `data.php` has no other free-text field; extra form fields are silently dropped. |
| `mediaKey()` strips `t`/`p` and keys the UI | Otherwise a pause remounts the player: black frame + reload instead of a pause. `stripSync` splits on `&` rather than regex-replacing, because a global replace eats the separator and drops the following param. |
| Pausing does **not** seek | The pause arrives up to a second late; aligning to it rewinds visibly. Only a screen that booted *while* paused positions itself (`hasPlayedRef`). |
| `playbackRate` is only written when it must move | On WebKit a rate write can cost a frame — the exact jank being chased. `config.sync.webkit` corrects less often and less aggressively. |
| Drift correction skips `readyState < 3` | Seeking a starved decoder every tick converts "slow" into "stuttering". |
| YouTube loops via `seekTo(0)` on ENDED, never `loop=1&playlist=` | The playlist form makes YouTube draw prev/next buttons over the panel. |
| `contract.js` is the only file that knows the server's field names | `data.php`/`sse.php` change shape → change `adaptSnapshot`/`toFormData` and nothing else. |
| `data.php` rejects partial writes | Every write sends both `Status` and `Play`, which is why pausing re-sends the current URL. |
| A `200` from `data.php` is not success | Failure is reported in the body; `apiClient` checks `Status` too. |
| No staleness watchdog on the SSE client | `sse.php` sends `: heartbeat` **comments**, which the EventSource parser consumes without surfacing to JS. A "no data for N seconds" timer would fire constantly on a healthy-but-quiet stream — the normal state. Liveness is judged from the connection. |
| HashRouter, `base: './'` | Screens open from QR codes on hosts with no SPA fallback routing. |
| The screen renders **nothing** over the video | No controls, no titles. `ScreenPulse` (a tiny corner readout) is the one commissioning exception. |

## Media pipeline

Masters live in `media-source/raw/` (gitignored — they are hundreds of MB).
Encoded output is committed at `src/assets/video/<key>.mp4`.

```bash
./scripts/encode-media.sh "media-source/raw/<master>.mp4" v1
```

The flags are documented at the top of that script. The one that is a **sync**
setting rather than a size setting: `-g 24 -keyint_min 24 -sc_threshold 0` puts a
keyframe at exactly every second with no scene-cut variance. `currentTime` writes
can only land on a keyframe, so sparse or unevenly spaced ones mean ten panels snap
to ten different frames after the same correction.

Current library — both 720×1080 @ 24fps, re-encoded from ~180 MB WhatsApp masters:

| key | duration | size | bitrate |
| --- | --- | --- | --- |
| `v1` | 78.3s | 8.6 MB | ~0.9 Mbps |
| `v2` | 41.3s | 12.3 MB | ~2.4 Mbps |

**Renaming or adding a clip is one place only**: `config.bundledVideos`. `key` is
the identity that travels over the wire and must not change casually (a screen
mid-playback resolves its media by it); `title` and `note` are shown to people.
Adding a third clip = one import plus one entry.

Files are muted on the panel, but audio is kept in the encode — unmuting is a
one-line change in `SyncedVideo`, re-encoding to get sound back is not.

## Layout traps already paid for

- `ScreenFrame` sizes with viewport units, **not** `position: fixed`. Fixed
  resolves against the nearest *transformed* ancestor, and every route is wrapped
  in an animated container.
- `FittedCanvas` centres by absolute positioning + half-size pull-back, **not**
  grid/flex centring. The grid row grows to the item's own 1480px, so
  `place-items: center` has nothing left to centre and `scale()` pivots about a
  point 740px below the visible area — reads as "cropped from the bottom".
- If the panel still looks cropped in the field, it's browser chrome. Kiosk it:
  ```
  chrome.exe --kiosk --autoplay-policy=no-user-gesture-required "http://<host>/#/screen/1"
  ```

## Screen query options (after the hash)

`#/screen/1?fit=contain&debug=1`

| Option | Effect |
| --- | --- |
| `fit=cover` \| `contain` | Crop to fill (default) or letterbox. |
| `debug=1` | Clock/drift/preload badge. Use this when commissioning a wall. |
| `pair=1` | Show system number + pairing QR instead of black. |
| `preview=1` | Desktop device mock. Design aid — never on the panel. |
| `aspect=W:H` | Embeds only; crop the third-party player's own bars. |

Diagnostics tick at 2Hz and are only wired into React state when `debug=1` — feeding
them in unconditionally re-rendered the whole tree twice a second.

## Layout of the source

```
src/lib/
  config.js       every env-dependent value + the video library + devMock
  mockBackend.js  in-browser stand-in for sse.php/data.php (dev only)
  contract.js     wire format + adapters — the seam to the backend
  apiClient.js    data.php writes, timeouts, typed errors
  sseClient.js    EventSource with backoff + jitter; SYS_NO validation
  clock.js        server-time offset; `now()`
  videoCache.js   fetch-to-blob preloading
  media.js        URL → { kind, src | embedUrl }; sync param parsing
  platform.js     WebKit media quirks
  system.js       SYS_NO normalisation, persistence, shareable links
src/hooks/        useSystemChannel (read) · useSystemActions (write) · useSysNo
src/routes/       Landing · Screen · Controller (lazy-loaded)
```

## Conventions

- JSX, no TypeScript. ESLint flat config; `npm run lint` must pass.
- Comments in this codebase explain **why**, usually naming the bug that was hit.
  Match that — a comment restating the code is worse than none.
- State that must reset on a prop change is adjusted **during render**
  (`if (session.sysNo !== sysNo) setSession(...)`), not in an effect, so a stale
  system is never painted.
- The controller exposes exactly what the backend models: send URL, play/pause,
  restart, clear. **No queue, volume, seek or loop** — that would be UI lying about
  state the server cannot hold. Extend `data.php` first, then `contract.js`.
