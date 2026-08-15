import v1 from "../assets/video/v1.mp4";
// import v2 from "../assets/video/v2.mp4";  ← uncomment with its entry below

// The literal `&` in "Tap&Play" is part of the path, not a query separator, so
// it is written raw and never URL-encoded.
export const config = {
  // ──────────────────────────────────────────────────────────────────────
  // TESTING WITHOUT THE PHP HOST. There are two ways, and the difference
  // matters — pick by how many browsers are involved:
  //
  //   ONE browser, several tabs
  //     devMock.enabled = true. Nothing to run. The backend is faked inside
  //     the page (src/lib/mockBackend.js).
  //
  //     >> HARD LIMIT: this uses BroadcastChannel + localStorage, which are
  //     >> scoped to ONE browser profile on ONE origin. Chrome cannot see
  //     >> Edge, and no other machine can see either. Tabs of the same
  //     >> browser at the same http://host:port — that is the whole reach.
  //
  //   Two browsers, or two machines, or ten screens
  //     devMock.enabled = false, and run `npm run mock` (scripts/mock-server.mjs).
  //     Then point apiBaseUrl at THIS machine's LAN IP below — not localhost,
  //     or the other devices cannot reach it:
  //
  //         apiBaseUrl: "http://192.168.x.x:4000"
  //
  //     That is a real HTTP server speaking the real contract, so the app uses
  //     a genuine EventSource and genuine POSTs, exactly as against the PHP.
  //
  // Either way the rest of the app is untouched: real hooks, real clock, real
  // blob cache, real sync maths. Only the two network seams divert.
  // ──────────────────────────────────────────────────────────────────────
  devMock: {
    enabled: false,

    // Which SYS_NOs the fake server admits. Anything else gets the real
    // server's "Invalid System Number." so the setup gate stays testable.
    systems: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],

    // Deliberately as slow as the real thing — see the header comment in
    // mockBackend.js. An instant mock makes broken sync look perfect.
    deliveryMs: [600, 1100], // write → screen hears about it
    connectMs: [120, 350], // stream open → first frame
    writeMs: [60, 160], // POST round trip as the controller feels it
  },

  // NOTE: `devMock.enabled = false` alone does NOT reach the Node mock — it just
  // sends the app back to whatever this points at. The two settings move together.
  //
  //   npm run mock  →  the LAN-IP:4000 line below
  //   live PHP host →  one of the commented lines
  // apiBaseUrl: "http://192.168.10.38:4000",
  apiBaseUrl: "http://192.168.0.88/API",
  // apiBaseUrl: "http://192.168.1.88/Test/Tap&Play",

  endpoints: {
    stream: "/sse.php",
    update: "/data.php",
  },

  systemParam: "SYS_NO",

  sse: {
    minRetry: 1000,
    maxRetry: 15000,
  },

  validateTimeoutMs: 7000,

  screen: {
    width: 720,
    height: 1480,
  },

  // The video library, bundled into the build. The controller sends
  // `local:<key>`, so the screens never fetch across the network for their
  // primary content — and every screen holds every clip before it is asked for,
  // which is what makes switching between them instant on all ten panels.
  //
  // THIS IS THE ONE PLACE TO RENAME A VIDEO. `key` is the identity that travels
  // over the wire and must not change casually (a screen mid-playback resolves
  // its media by it); `title` and `note` are shown to people and can say
  // anything. Adding a third clip = one import plus one entry here.
  // A clip is only in the build if it is IMPORTED — Vite emits an asset for the
  // import, not for this list. So taking one out of circulation has two levels:
  //
  //   enabled: false      out of the UI, still shipped, still resolvable.
  //                       Use when a clip may need to come back mid-event.
  //   import commented    out of the build entirely. The bytes are gone from
  //                       the deploy, and `local:v2` no longer resolves.
  //
  // v2 is currently at the second level, awaiting its final cut. To restore it:
  // uncomment the import at the top of this file and the entry below.
  bundledVideos: [
    { key: "v1", title: "Video 1", note: "40s · 720×1082", src: v1 },
    // { key: "v2", title: "Video 2", note: "78s · 720×1080", src: v2 },
  ],

  media: {
    // Download the file in full, then play it from memory. Set false to stream
    // straight from the URL if a device ever refuses a blob: source.
    preferBlobPlayback: true,

    // Play the clip's audio on the panel. Override per screen with `?audio=0`
    // (mute this one) or `?audio=1` (unmute this one).
    //
    // Browsers refuse to autoplay UNMUTED without a user gesture, so a panel
    // left to boot on its own would otherwise sit silent. Launch it with
    //   --autoplay-policy=no-user-gesture-required   (Chrome kiosk does this)
    // and it plays with sound unattended. Without that flag the screen falls
    // back to muted playback rather than showing nothing, and picks the sound
    // up on the first tap — a black wall is a worse failure than a quiet one.
    audio: true,

    // How the video sits in the panel when the clip's shape does not match the
    // screen's. Both clips are 2:3 and every portrait panel is narrower than
    // that, so `cover` has to eat 15–27% off the left and right edges.
    // `contain` letterboxes instead: nothing is ever cropped.
    // Per screen: `?fit=cover`.
    fit: "contain",
  },

  // Same-origin URL used to read the server's clock. Empty = the page's own
  // origin, which in deployment is the Apache host serving the PHP.
  clockProbeUrl: "",
  clockResyncMs: 5 * 60 * 1000,

  sync: {
    correctionMs: 500,
    softDrift: 0.02, // seconds — below this, leave it alone
    hardSeek: 0.35, // seconds — beyond this, jump rather than slide
    maxRateAdjust: 0.05, // playbackRate stays within 0.95–1.05

    // With sound on, that same ±5% is audible — `preservesPitch` keeps the
    // pitch but the time-stretch artefacts warble on sustained notes. A tighter
    // cap trades slower drift correction for audio that survives being listened
    // to. Hard seeks (> sync.hardSeek) still snap instantly either way.
    audioMaxRateAdjust: 0.02,

    // WebKit corrects less often and less aggressively; frequent playbackRate
    // writes there cost frames, which reads as stutter.
    webkit: {
      correctionMs: 1000,
      softDrift: 0.06,
      maxRateAdjust: 0.03,
    },

    // Measured POST → SSE delivery is 0.6–1.1s depending where the write lands
    // in the server's poll cycle. The lead must clear the worst case so every
    // screen is holding the instruction before the instant it schedules.
    restartLeadMs: 2500,
  },

  // Origin encoded into the screen's pairing QR. Empty = use the current origin,
  // which is `localhost` in development and unreachable from a phone.
  publicOrigin: "",
};

/**
 * The clips currently in circulation — what the controller offers and what the
 * screens preload.
 *
 * Deliberately NOT what `bundledVideo()` searches: a screen already playing a
 * clip that was just withdrawn must keep resolving it, or withdrawing one would
 * black out any panel mid-loop on it.
 */
export function activeVideos() {
  return config.bundledVideos.filter((v) => v.enabled !== false);
}

/** The library entry a `local:<key>` URL — or a bare key — refers to. */
export function bundledVideo(keyOrUrl) {
  const key = String(keyOrUrl || "")
    .replace(/^local:/, "")
    .split("?")[0];
  return config.bundledVideos.find((v) => v.key === key) || null;
}

/** The wire URL for a library entry. */
export function bundledUrl(key) {
  return `local:${key}`;
}

export function endpoint(name, sysNo) {
  const path = config.endpoints[name];
  if (!path) throw new Error(`Unknown endpoint: ${name}`);
  return `${config.apiBaseUrl}${path}?${
    config.systemParam
  }=${encodeURIComponent(sysNo)}`;
}
