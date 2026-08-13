import v1 from "../assets/video/v1.mp4";
import v2 from "../assets/video/v2.mp4";

// The literal `&` in "Tap&Play" is part of the path, not a query separator, so
// it is written raw and never URL-encoded.
export const config = {
  // apiBaseUrl: "http://192.168.1.88/Test/Tap&Play",
  apiBaseUrl: "http://192.168.0.88/API",

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
  bundledVideos: [
    { key: "v1", title: "Video 1", note: "v1.mp4", src: v1 },
    { key: "v2", title: "Video 2", note: "v2.mp4", src: v2 },
  ],

  media: {
    // Download the file in full, then play it from memory. Set false to stream
    // straight from the URL if a device ever refuses a blob: source.
    preferBlobPlayback: true,
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
  return `${config.apiBaseUrl}${path}?${config.systemParam}=${encodeURIComponent(sysNo)}`;
}
