import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/apiClient.js'
import { PLAY_STATUS } from '../lib/contract.js'
import { parseSync, withSync } from '../lib/media.js'
import { now } from '../lib/clock.js'
import { config } from '../lib/config.js'

const EXPECTATION_TTL = 4000

/**
 * Controller-side writes.
 *
 * The screen remains the source of truth — nothing here changes what is playing,
 * it only records what was just asked for. That matters because the server
 * takes 0.6–1.1s to echo a change back, and without an expectation the button
 * snaps back to its previous icon in the meantime, which reads as a tap that
 * did not register.
 *
 * The expectation is deliberately short-lived and always loses to the echo, so
 * a second controller changing state is never masked by it.
 */
export function useSystemActions(sysNo) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const [expected, setExpected] = useState(null) // { status, at }
  const [scheduledAt, setScheduledAt] = useState(0)

  const run = useCallback(async (label, fn) => {
    setPending(label)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong')
      return null
    } finally {
      setPending(null)
    }
  }, [])

  const play = useCallback(
    (url) => {
      setExpected({ status: PLAY_STATUS.PLAY, at: Date.now() })
      return run('play', () => api.play(sysNo, url))
    },
    [sysNo, run],
  )

  /**
   * Pause / resume, preserving the frame.
   *
   * Pausing records the instant it happened. Resuming pushes the anchor forward
   * by exactly how long the pause lasted, so the position works out to the frame
   * it stopped on — without this the loop keeps advancing against the wall clock
   * while frozen and resumes wherever the clock has got to.
   *
   * Every screen derives position from the same anchor, so they stay in step
   * even though each receives the message at a slightly different moment.
   *
   * data.php requires both fields on every write, so the URL always rides along.
   */
  const toggle = useCallback(
    (currentUrl, currentStatus) => {
      const pausing = currentStatus !== PLAY_STATUS.PAUSE
      const { anchor, pausedAt } = parseSync(currentUrl)
      const at = now()

      const url = pausing
        ? withSync(currentUrl, { anchor, pausedAt: at })
        : withSync(currentUrl, { anchor: pausedAt ? anchor + (at - pausedAt) : anchor })

      const next = pausing ? PLAY_STATUS.PAUSE : PLAY_STATUS.PLAY
      setExpected({ status: next, at: Date.now() })
      return run('toggle', () => api.setStatus(sysNo, next, url))
    },
    [sysNo, run],
  )

  /**
   * Re-anchor every screen's loop to a common instant.
   *
   * The timestamp is stamped into the URL because data.php stores no other
   * free-text field. The lead has to clear the server's worst-case delivery so
   * every screen is holding the instruction before the moment it names — which
   * is exactly why the screens then wait for it rather than starting on arrival.
   */
  const restart = useCallback(
    (currentUrl) => {
      const anchor = now() + config.sync.restartLeadMs
      setScheduledAt(anchor)
      setExpected({ status: PLAY_STATUS.PLAY, at: Date.now() })
      // Restart is the only action that drops the frozen position and goes to 0.
      return run('restart', () =>
        api.setStatus(sysNo, PLAY_STATUS.PLAY, withSync(currentUrl, { anchor })),
      )
    },
    [sysNo, run],
  )

  // Clear the scheduled flag when the anchor arrives. Set from the handler
  // above, cleared from a timer callback — never assigned in an effect body.
  useEffect(() => {
    if (!scheduledAt) return undefined
    const timer = setTimeout(() => setScheduledAt(0), Math.max(0, scheduledAt - now()))
    return () => clearTimeout(timer)
  }, [scheduledAt])

  const stop = useCallback(() => run('stop', () => api.stop(sysNo)), [sysNo, run])

  /** What the controller should show: the echo once it lands, the ask until then. */
  const resolveStatus = useCallback(
    (actual) => {
      if (!expected) return actual
      if (expected.status === actual) return actual
      if (Date.now() - expected.at > EXPECTATION_TTL) return actual
      return expected.status
    },
    [expected],
  )

  return {
    pending,
    error,
    /** True between tapping Restart and the instant every screen jumps. */
    restartScheduled: scheduledAt > 0,
    resolveStatus,
    clearError: useCallback(() => setError(null), []),
    play,
    toggle,
    restart,
    stop,
  }
}
