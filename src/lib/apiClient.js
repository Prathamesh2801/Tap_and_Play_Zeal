import { config, endpoint } from './config.js'
import { isWriteOk, PLAY_STATUS, toFormData } from './contract.js'
import { mockWrite } from './mockBackend.js'

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * POST to data.php.
 *
 * Deliberately sends bare FormData with no custom headers: that keeps it a CORS
 * "simple request", so the browser skips the preflight the PHP host would
 * otherwise have to answer.
 */
async function post(url, formData, { timeout = 12000, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const res = await fetch(url, { method: 'POST', body: formData, signal: controller.signal })
    const text = await res.text()
    const payload = text ? safeParse(text) : null

    if (!res.ok) {
      throw new ApiError(payload?.Message || `Request failed (${res.status})`, {
        status: res.status,
        body: payload,
      })
    }
    // A 200 does not mean success here — the server reports failure in the body.
    if (!isWriteOk(payload)) {
      throw new ApiError(payload?.Message || 'The server rejected the update.', { body: payload })
    }
    return payload
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err?.name === 'AbortError') throw new ApiError('The server took too long to respond.')
    throw new ApiError('Could not reach the server. Check the network and try again.')
  } finally {
    clearTimeout(timer)
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

/**
 * Every write funnels through here, so the dev-mock diversion is one branch in
 * one place rather than four.
 *
 * The mock is handed the same FormData the real server would receive — that
 * keeps `toFormData`'s normalisation (Restart collapses to Play, anything
 * unrecognised to Pause) shared between the two paths instead of reimplemented
 * in the mock and left to drift out of step.
 */
function write(sysNo, { status, url }, opts) {
  const body = toFormData({ status, url })

  if (config.devMock.enabled) {
    return mockWrite(sysNo, body).catch((err) => {
      throw new ApiError(err?.message || 'The server rejected the update.')
    })
  }
  return post(endpoint('update', sysNo), body, opts)
}

export const api = {
  /** Send a URL to the screen and start it. */
  play: (sysNo, url, opts) => write(sysNo, { status: PLAY_STATUS.PLAY, url }, opts),

  /** Pause. The current URL must be re-sent — the endpoint rejects partial writes. */
  pause: (sysNo, url, opts) => write(sysNo, { status: PLAY_STATUS.PAUSE, url }, opts),

  /** Clear the screen by pausing with an empty URL. */
  stop: (sysNo, opts) => write(sysNo, { status: PLAY_STATUS.PAUSE, url: '' }, opts),

  setStatus: (sysNo, status, url, opts) => write(sysNo, { status, url }, opts),
}
