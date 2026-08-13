/**
 * The wire contract with the PHP backend, written down in one place.
 *
 * This is the ONLY file that knows the server's field names. If data.php or
 * sse.php change shape, change `adaptSnapshot` / `toFormData` and nothing else.
 *
 * ── sse.php?SYS_NO=n ───────────────────────────────────────────────────
 *   Unnamed `data:` frames (so they arrive as EventSource "message" events),
 *   pushed once on connect and again on every change. `: heartbeat` comment
 *   lines keep the socket warm — note these are NOT visible to JavaScript.
 *
 *     data: {"Status":true,"Message":"System Found","SYS_NO":"1",
 *            "PlayStatus":"Pause","Play":"https://…/clip.mp4"}
 *
 *   Unknown system:
 *     data: {"Status":false,"Message":"Invalid System Number."}
 *
 * ── data.php?SYS_NO=n ──────────────────────────────────────────────────
 *   POST multipart/form-data. BOTH fields are required — sending one alone
 *   returns {"Status":false,"Message":"Data are missing."}
 *
 *     Status: "Play" | "Pause"
 *     Play:   the media URL
 *
 *   → {"Status":true,"Message":"Play Updated"}
 */

export const PLAY_STATUS = {
  PLAY: 'Play',
  PAUSE: 'Pause',
  RESTART: 'Restart',
}

export const EMPTY_SNAPSHOT = Object.freeze({
  sysNo: null,
  found: false,
  message: null,
  url: '',
  playStatus: PLAY_STATUS.PAUSE,
  receivedAt: 0,
})

/** Normalise an sse.php frame into the shape the UI consumes. */
export function adaptSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_SNAPSHOT

  const found = raw.Status === true || raw.Status === 'true'
  const status = raw.PlayStatus

  return {
    sysNo: raw.SYS_NO != null ? String(raw.SYS_NO) : null,
    found,
    message: raw.Message ?? null,
    url: typeof raw.Play === 'string' ? raw.Play : '',
    playStatus:
      status === PLAY_STATUS.PLAY || status === PLAY_STATUS.RESTART ? status : PLAY_STATUS.PAUSE,
    receivedAt: Date.now(),
  }
}

/**
 * Build the write body. Both fields go on every request because the endpoint
 * rejects partial updates — pausing therefore means re-sending the current URL.
 */
export function toFormData({ status, url }) {
  const body = new FormData()
  body.append('Status', status === PLAY_STATUS.PLAY ? PLAY_STATUS.PLAY : PLAY_STATUS.PAUSE)
  body.append('Play', url ?? '')
  return body
}

/** Did a data.php response indicate success? */
export function isWriteOk(raw) {
  return Boolean(raw && (raw.Status === true || raw.Status === 'true'))
}
