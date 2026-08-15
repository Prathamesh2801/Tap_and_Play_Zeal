import { useEffect, useRef, useState } from 'react'
import { now } from '../../lib/clock.js'
import { preloadMedia } from '../../lib/videoCache.js'
import { correctTo, positionAt, rateCapFor, tuningFor } from '../../lib/mediaSync.js'
import { PLAY_STATUS } from '../../lib/contract.js'

/**
 * The room's sound, played by the controller.
 *
 * The wall is silent — ten panels playing one track a few tens of milliseconds
 * apart comb-filter into something worse than no audio at all. So the laptop
 * that drives the wall is also the thing wired to the speakers, and it plays a
 * separate audio-only file of the same clip.
 *
 * It stays with the picture for exactly the reason the panels stay with each
 * other: position is a function of the shared clock and the anchor carried in
 * the media URL, never of when a message arrived. The same `?t=` that tells ten
 * screens where to be tells this element where to be, so it is not following
 * the video — both are following the clock, independently.
 *
 * That is also why the audio file has to be trimmed to the video's exact
 * duration at encode time. Two loops of even slightly different length drift
 * apart a little more on every pass, and no amount of correction fixes a
 * mismatch that is reintroduced every 40 seconds.
 *
 * Autoplay is far less of a problem here than on a panel: the controller is
 * driven by taps, so a gesture has almost always happened. When it has not — a
 * page reloaded while the wall is mid-loop — `blocked` is reported so the UI
 * can offer a button, rather than sitting silent with no explanation.
 */
export function SyncedAudio({ src, anchor = 0, pausedAt = 0, playStatus, muted, onBlocked }) {
  const ref = useRef(null)
  const hasPlayedRef = useRef(false)

  const [playbackUrl, setPlaybackUrl] = useState(null)
  const [loadedFor, setLoadedFor] = useState(src)

  // Reset during render on a source change, so the previous clip's audio is
  // never played against the new one's anchor.
  if (loadedFor !== src) {
    setLoadedFor(src)
    setPlaybackUrl(null)
  }

  // Same fetch-to-blob path the screens use. The file is ~1 MB, so this is
  // quick, but it still means playback never waits on the network mid-loop.
  useEffect(() => {
    let cancelled = false
    // A new clip has never been played by this element, whatever the last one did.
    hasPlayedRef.current = false
    preloadMedia(src)
      .then((url) => !cancelled && setPlaybackUrl(url))
      .catch(() => !cancelled && setPlaybackUrl(src))
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = muted
    // Drift correction moves playbackRate; without this every correction
    // detunes the track, which on a speaker is far more obvious than on a panel.
    el.preservesPitch = true
    if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true
  }, [muted, playbackUrl])

  const playing = playStatus !== PLAY_STATUS.PAUSE

  useEffect(() => {
    const el = ref.current
    if (!el || !playbackUrl) return undefined

    const { tick, soft, hardSeek, maxRate } = tuningFor()

    let startTimer = null
    let interval = null

    const duration = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0)
    const at = (instant) => positionAt(instant, anchor, duration())
    const target = () => at(now())

    const correct = () => {
      const total = duration()
      if (!total || now() < anchor) return
      // Nothing decodable yet — seeking a starved element only sets it back.
      if (el.readyState < 3) return

      // Always the audible cap here: this element is the sound in the room.
      correctTo(el, target(), total, { soft, hardSeek, maxRate: rateCapFor(maxRate, true) })
    }

    const begin = () => {
      if (duration()) el.currentTime = target()
      hasPlayedRef.current = true

      el.play().then(
        () => onBlocked?.(false),
        // No muted fallback: silent audio is not a degraded mode, it is just
        // silence. Report it so the UI can ask for the gesture it needs.
        () => onBlocked?.(true),
      )

      interval = setInterval(correct, tick)
    }

    const arm = () => {
      if (!playing) {
        el.pause()
        el.playbackRate = 1
        // Matches the screens: no seek on pause, because the instruction lands
        // up to a second late and aligning to it rewinds audibly. Only a
        // controller that loaded while already paused positions itself.
        if (pausedAt && duration() && !hasPlayedRef.current) {
          try {
            el.currentTime = at(pausedAt)
          } catch {
            /* metadata not ready yet */
          }
        }
        return
      }

      const wait = anchor - now()
      if (wait > 0) {
        // Scheduled start — hold silence until the instant the screens use.
        el.pause()
        try {
          el.currentTime = 0
        } catch {
          /* metadata not ready; begin() seeks again anyway */
        }
        startTimer = setTimeout(begin, wait)
      } else {
        begin()
      }
    }

    if (el.readyState >= 1) arm()
    else el.addEventListener('loadedmetadata', arm, { once: true })

    return () => {
      clearTimeout(startTimer)
      clearInterval(interval)
      el.removeEventListener('loadedmetadata', arm)
    }
  }, [playbackUrl, anchor, pausedAt, playing, onBlocked])

  return <audio ref={ref} src={playbackUrl || undefined} loop preload="auto" />
}
