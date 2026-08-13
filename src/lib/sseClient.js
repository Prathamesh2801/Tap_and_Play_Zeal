import { config, endpoint } from './config.js'

/**
 * A resilient EventSource wrapper for sse.php.
 *
 * Why no staleness watchdog: sse.php sends `: heartbeat` comment lines, and
 * comments are consumed by the EventSource parser without ever surfacing to
 * JavaScript. A "no data for N seconds" timer would therefore fire constantly
 * on a healthy-but-quiet stream — which is the normal state, since the server
 * only pushes when something actually changes. Liveness is judged from the
 * connection itself instead.
 *
 * What we do add over the browser's built-in reconnect:
 *   - exponential backoff with jitter, so a restarted Apache is not stampeded
 *   - an immediate redial when the tab becomes visible or the device comes back
 *     online, instead of waiting out the backoff
 *   - explicit status reporting, so the UI can show "reconnecting" honestly
 */
export function createSystemStream(sysNo, { onSnapshot, onStatus } = {}) {
  let source = null
  let retryTimer = null
  let attempt = 0
  let closed = false

  const setStatus = (status, detail) => onStatus?.(status, detail)

  const teardown = () => {
    if (source) {
      source.onopen = source.onerror = source.onmessage = null
      source.close()
      source = null
    }
  }

  const backoff = () => {
    const base = Math.min(config.sse.minRetry * 2 ** attempt, config.sse.maxRetry)
    return base * (0.7 + Math.random() * 0.6)
  }

  const reconnect = () => {
    if (closed) return
    teardown()
    clearTimeout(retryTimer)
    const wait = backoff()
    attempt += 1
    setStatus('reconnecting', { attempt, retryInMs: Math.round(wait) })
    retryTimer = setTimeout(connect, wait)
  }

  function connect() {
    if (closed) return
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting', { attempt })

    source = new EventSource(endpoint('stream', sysNo))

    source.onopen = () => {
      attempt = 0
      setStatus('open')
    }

    // sse.php emits unnamed frames, so everything arrives as `message`.
    source.onmessage = (evt) => {
      if (closed || !evt.data) return
      try {
        onSnapshot?.(JSON.parse(evt.data))
      } catch {
        // A malformed frame is not worth dropping the connection over.
      }
    }

    source.onerror = () => {
      if (source?.readyState !== EventSource.OPEN) reconnect()
    }
  }

  const wake = () => {
    if (closed) return
    if (document.visibilityState === 'visible' && source?.readyState !== EventSource.OPEN) {
      attempt = 0
      reconnect()
    }
  }

  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)

  connect()

  return () => {
    closed = true
    clearTimeout(retryTimer)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('online', wake)
    teardown()
    setStatus('closed')
  }
}

/**
 * Confirm a SYS_NO exists by opening the stream and reading its first frame.
 * Used by the setup screen so a typo is caught immediately rather than becoming
 * a screen that silently never plays.
 *
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export function validateSystemNo(sysNo) {
  return new Promise((resolve) => {
    let source
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      source?.close()
      resolve(result)
    }

    const timer = setTimeout(
      () => finish({ valid: false, message: 'No response from the server. Check the network.' }),
      config.validateTimeoutMs,
    )

    try {
      source = new EventSource(endpoint('stream', sysNo))
    } catch {
      return finish({ valid: false, message: 'Could not reach the server.' })
    }

    source.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        finish({
          valid: data?.Status === true,
          message: data?.Message || (data?.Status === true ? 'System found' : 'Invalid system number.'),
        })
      } catch {
        finish({ valid: false, message: 'The server sent an unreadable response.' })
      }
    }

    source.onerror = () => finish({ valid: false, message: 'Could not reach the server.' })
  })
}
