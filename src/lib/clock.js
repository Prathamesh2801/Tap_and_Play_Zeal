import { config } from './config.js'

/**
 * Shared clock.
 *
 * Ten screens can only play in step if they agree on the time. Their own system
 * clocks are not good enough — Windows NTP routinely drifts seconds — so each
 * screen measures its offset from the web server's clock and works in server
 * time from then on.
 *
 * The measurement uses the `Date` response header. It only has one-second
 * resolution, so instead of reading it directly we watch for the *instant it
 * ticks over*: sampling every ~25ms, the moment the header changes we know the
 * server's clock just crossed that exact second boundary. That converts a
 * coarse header into a sub-frame time reference.
 *
 * `Date` is not a CORS-safelisted header, so this only works same-origin — which
 * is the deployed arrangement, since the app is served from the same Apache host
 * as the PHP. In development it falls back to the local clock, which is correct
 * anyway when every screen is the same machine.
 */

const state = {
  offset: 0,
  accuracy: null,
  source: 'local',
  syncedAt: 0,
}

const listeners = new Set()

/** Current time in server-clock milliseconds. Use this everywhere, never Date.now(). */
export function now() {
  return Date.now() + state.offset
}

export function clockState() {
  return { ...state }
}

export function onClockChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probe(url) {
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  const receivedAt = performance.timeOrigin + performance.now()
  const header = res.headers.get('Date')
  if (!header) return null
  const serverSecond = new Date(header).getTime()
  return Number.isFinite(serverSecond) ? { serverSecond, receivedAt } : null
}

/**
 * Hunt for second-boundary crossings and derive the offset from them.
 * Each crossing gives one estimate; the tightest-bracketed one wins.
 */
async function measure(url, { attempts = 60, spacing = 25, crossings = 2 } = {}) {
  let previous = null
  let best = null
  let found = 0

  for (let i = 0; i < attempts; i += 1) {
    let sample
    try {
      sample = await probe(url)
    } catch {
      return null
    }
    if (!sample) return null

    if (previous && sample.serverSecond > previous.serverSecond) {
      // The tick happened somewhere between the two responses. Take the midpoint
      // and treat the bracket width as the uncertainty.
      const bracket = sample.receivedAt - previous.receivedAt
      const localAtTick = (sample.receivedAt + previous.receivedAt) / 2
      const estimate = { offset: sample.serverSecond - localAtTick, accuracy: bracket / 2 }
      if (!best || estimate.accuracy < best.accuracy) best = estimate
      found += 1
      // Stop as soon as enough boundaries have been seen. Every extra probe is
      // a request, and a burst of them is itself a source of jank on a phone.
      if (found >= crossings) break
    }

    previous = sample
    await sleep(spacing)
  }

  return best
}

let running = null

export async function syncClock(options) {
  if (running) return running

  running = (async () => {
    const url = config.clockProbeUrl || `${window.location.origin}${window.location.pathname}`
    const result = await measure(url, options)

    if (result) {
      state.offset = Math.round(result.offset)
      state.accuracy = Math.round(result.accuracy)
      state.source = 'server'
    } else {
      state.offset = 0
      state.accuracy = null
      state.source = 'local'
    }
    state.syncedAt = Date.now()

    listeners.forEach((l) => l(clockState()))
    running = null
    return clockState()
  })()

  return running
}

/** Re-sync periodically; a screen left running for days will drift on its own. */
export function startClockSync(options) {
  syncClock(options)
  const timer = setInterval(() => syncClock(options), config.clockResyncMs)
  return () => clearInterval(timer)
}
