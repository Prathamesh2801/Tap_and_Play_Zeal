# Tap & Play

Push any video URL to a screen, in real time. Two surfaces bound by a **system number**.

- **Screen** (`#/screen/:sysNo`) — a 720 × 1480 portrait panel. Shows its system number + QR when idle, plays media the moment it arrives. Read-only.
- **Controller** (`#/controller/:sysNo`) — a phone-sized remote. Sends URLs, plays/pauses, clears the screen.

Both talk to the PHP backend. The controller POSTs and then **waits for the SSE echo** — nothing is applied optimistically, so what the phone shows is always what the screen is actually doing, even with two phones on one system.

```
 controller ──POST data.php──►  PHP  ──SSE sse.php──►  screen
      ▲                          │
      └────────SSE sse.php───────┘
```

## Run it

```bash
npm install
npm run dev
```

The backend sends `Access-Control-Allow-Origin: *`, so the app calls it directly — no dev proxy.

**To use a real phone as the controller:** set `VITE_PUBLIC_ORIGIN=http://<your-lan-ip>:5173` in `.env`, otherwise the screen's QR encodes `localhost` and the phone can't reach it.

## SYS_NO

Captured once at startup and saved to `localStorage`, then carried in the URL so every screen is addressable by link or QR.

Precedence is **URL > stored value > setup screen**, so a scanned QR always wins and becomes the new remembered system. "Change system" on the controller clears it.

The number is **verified against the server before it's saved** — the setup screen opens `sse.php` and only accepts the value if the first frame says `System Found`. A typo fails visibly in about a second instead of becoming a screen that connects fine and silently never plays.

## Screen display options

Query options go **after the hash**: `#/screen/1?fit=cover`

| Option | Effect |
| --- | --- |
| `fit=cover` | Crop the media to fill the panel edge to edge. Use when black bars are worse than losing a sliver. |
| `fit=contain` | Letterbox, never crop (default). |
| `preview=1` | Render the desktop device mock instead of a real full-bleed screen. Design aid only — never use it on the panel. |

The screen is laid out with `position: fixed` against the viewport, so nothing in document flow can push it taller than the panel and clip the bottom. The idle screen is composed against the true 720 × 1480 grid and **scaled** to fit, so the design never reflows or drifts; media is full-bleed.

**If it still looks cropped, that's browser chrome** — the address bar takes space the layout can't reclaim. Tap the screen and hit the fullscreen control (top right), or launch the panel in kiosk mode:

```
chrome.exe --kiosk --autoplay-policy=no-user-gesture-required "http://<host>/#/screen/1"
```

Kiosk also removes the need for the "tap to enable sound" step.

## The backend contract

Documented in full at the top of [src/lib/contract.js](src/lib/contract.js) — the only file that knows the server's field names.

**`GET sse.php?SYS_NO=n`** — unnamed `data:` frames, pushed on connect and on every change, with `: heartbeat` comments in between.

```json
{"Status":true,"Message":"System Found","SYS_NO":"1","PlayStatus":"Pause","Play":"https://…/clip.mp4"}
{"Status":false,"Message":"Invalid System Number."}
```

**`POST data.php?SYS_NO=n`** — `multipart/form-data`. **Both** fields are required; sending one alone returns `{"Status":false,"Message":"Data are missing."}`. This is why pausing re-sends the current URL.

| Field | Values |
| --- | --- |
| `Status` | `Play` \| `Pause` |
| `Play` | the media URL |

→ `{"Status":true,"Message":"Play Updated"}`

Note a `200` does **not** mean success — the server reports failure in the body, so `apiClient` checks `Status` as well as the HTTP code.

## Architecture

```
src/lib/
  config.js       every env-dependent value, in one place
  contract.js     wire format + adapters — the seam to the backend
  apiClient.js    data.php writes, timeouts, typed errors
  sseClient.js    EventSource with backoff + jitter; SYS_NO validation
  media.js        URL → { kind, src | embedUrl }; add providers here
  system.js       SYS_NO normalisation, persistence, shareable links
src/hooks/
  useSystemChannel.js  SSE subscription → server snapshot (read)
  useSystemActions.js  data.php writes (write)
  useSysNo.js          binds URL ↔ localStorage ↔ setup gate
src/routes/       Landing · Screen · Controller (lazy-loaded)
```

**Why HashRouter.** Screens open from pasted links and QR codes on hosts that often lack SPA fallback routing — signage players, static directories under Apache. Hash routes need no server config.

**Why no staleness watchdog on the SSE client.** `sse.php` sends `: heartbeat` comments, and comments are consumed by the EventSource parser without ever surfacing to JavaScript. A "no data for N seconds" timer would fire constantly on a healthy-but-quiet stream — which is the normal state, since the server only pushes on change. Liveness is judged from the connection instead, with jittered backoff and an immediate redial on `visibilitychange`/`online`.

**Scope note.** The controller exposes exactly what the backend models: send URL, play/pause, clear. There is deliberately no queue, volume, seek or loop — those would be UI that lies about a state the server can't hold. Add fields to `data.php` and they slot into `contract.js` and `useSystemActions.js`.

## Media handling

[media.js](src/lib/media.js) detects direct video files, HLS/DASH, YouTube (incl. Shorts), Vimeo, and images; anything else is handed to `<video>` to attempt.

- **Direct video** — native `<video>`, driven by `PlayStatus`.
- **YouTube / Vimeo** — third-party iframes can't be driven through the DOM, so Play/Pause is relayed over `postMessage` (YouTube's JS API via `enablejsapi=1`, Vimeo's player API).
- **HLS** on non-Safari needs `hls.js` — add it in `VideoStage` if required.

**Autoplay:** browsers only autoplay unmuted after a user gesture, so the stage starts muted and offers a one-tap "enable sound" affordance. Launch the panel with `--autoplay-policy=no-user-gesture-required` (or Chrome kiosk) and it never appears.
