/**
 * A stand-in for sse.php + data.php, running entirely in the browser.
 *
 * Switched on by `config.devMock.enabled`. Nothing else in the app knows it
 * exists — `sseClient.js` and `apiClient.js` divert to it at their seam, so the
 * hooks, the sync maths and the blob cache all run exactly the code that runs
 * against the real server. That is the whole point: this tests the app, not a
 * different app that happens to look the same.
 *
 * ── How the tabs talk ──────────────────────────────────────────────────
 * State lives in localStorage (so a reload keeps playing, like the server would)
 * and changes are announced over BroadcastChannel. Open the screen in one tab
 * and the controller in another and they behave as two devices.
 *
 * BroadcastChannel deliberately does NOT deliver to the tab that posted, so
 * same-tab subscribers are fanned out to directly alongside it.
 *
 * ── Why it is slow on purpose ──────────────────────────────────────────
 * The real backend takes 0.6–1.1s to echo a write, and each connection sits at a
 * different point in the poll cycle, so ten screens hear the same change at ten
 * slightly different moments. An instant mock would hide exactly the problem the
 * anchor scheme exists to solve — every screen would look synced because they
 * all started together, which proves nothing.
 *
 * So each subscriber draws its own fixed lag from `config.devMock.deliveryMs`
 * and keeps it for the life of the connection. Open four screen tabs: they will
 * receive Restart up to half a second apart and must still jump on the same
 * frame. If they do, the sync is real.
 */

import { config } from './config.js'
import { PLAY_STATUS } from './contract.js'

const STORE_KEY = 'tapplay.mock.systems'
const CHANNEL_NAME = 'tapplay.mock'

/** @type {Set<{sysNo: string, lag: number, deliver: () => void}>} */
const subscribers = new Set()

let channel = null
function bus() {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event) => fanout(event.data?.sysNo)
  return channel
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Private mode — the in-tab subscribers still get their fanout.
  }
}

const known = (sysNo) => config.devMock.systems.includes(String(sysNo))

/** The frame sse.php would send for this system, right now. */
function frameFor(sysNo) {
  if (!known(sysNo)) return { Status: false, Message: 'Invalid System Number.' }

  const row = readStore()[String(sysNo)] || {}
  return {
    Status: true,
    Message: 'System Found',
    SYS_NO: String(sysNo),
    PlayStatus: row.PlayStatus || PLAY_STATUS.PAUSE,
    Play: row.Play || '',
  }
}

const between = ([min, max]) => min + Math.random() * (max - min)

function fanout(sysNo) {
  if (!sysNo) return
  subscribers.forEach((sub) => {
    if (sub.sysNo === String(sysNo)) setTimeout(sub.deliver, sub.lag)
  })
}

/**
 * Same signature and semantics as `createSystemStream`: pushes one frame on
 * connect, then one per change. Returns an unsubscribe function.
 */
export function mockStream(sysNo, { onSnapshot, onStatus } = {}) {
  const id = String(sysNo)
  let closed = false

  // Fixed for this connection, the way a real screen's position in the server's
  // poll cycle is fixed for as long as it stays connected.
  const lag = between(config.devMock.deliveryMs)

  const deliver = () => {
    if (closed) return
    onSnapshot?.(frameFor(id))
  }

  const sub = { sysNo: id, lag, deliver }
  subscribers.add(sub)
  bus()

  onStatus?.('connecting')

  // The initial frame arrives after a connect delay, not synchronously — a
  // subscriber that is populated before the first render is not something the
  // real server ever does, and it papers over first-paint bugs.
  const opened = setTimeout(() => {
    if (closed) return
    onStatus?.('open')
    deliver()
  }, between(config.devMock.connectMs))

  return () => {
    closed = true
    clearTimeout(opened)
    subscribers.delete(sub)
    onStatus?.('closed')
  }
}

/** Stands in for `validateSystemNo` on the setup gate. */
export function mockValidate(sysNo) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ok = known(sysNo)
      resolve({
        valid: ok,
        message: ok ? 'System found' : 'Invalid system number.',
      })
    }, between(config.devMock.connectMs))
  })
}

/**
 * Stands in for a POST to data.php.
 *
 * Takes the same FormData the real client sends, so `toFormData`'s normalisation
 * (Restart collapses to Play, anything unknown to Pause) is shared rather than
 * reimplemented here and left to drift.
 *
 * @param {string|number} sysNo
 * @param {FormData} body
 */
export function mockWrite(sysNo, body) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const id = String(sysNo)

      if (!known(id)) {
        reject(new Error('Invalid System Number.'))
        return
      }

      const store = readStore()
      store[id] = { PlayStatus: body.get('Status'), Play: body.get('Play') ?? '' }
      writeStore(store)

      bus()?.postMessage({ sysNo: id })
      fanout(id) // BroadcastChannel skips its own tab.

      resolve({ Status: true, Message: 'Play Updated' })
    }, between(config.devMock.writeMs))
  })
}

/** Wipe every mocked system back to idle. Exposed on the dev badge. */
export function mockReset() {
  const store = readStore()
  writeStore({})
  Object.keys(store).forEach((sysNo) => {
    bus()?.postMessage({ sysNo })
    fanout(sysNo)
  })
}
