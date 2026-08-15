import { useEffect, useRef, useState } from 'react'
import { config } from '../../lib/config.js'
import { now } from '../../lib/clock.js'
import { preloadMedia } from '../../lib/videoCache.js'
import { isWebKitMedia } from '../../lib/platform.js'
import { PLAY_STATUS } from '../../lib/contract.js'

/**
 * A video whose position is a function of the clock, not of when it was told to
 * start.
 *
 * The loop is anchored to a fixed instant, so at any moment every screen can
 * compute where the video should be:
 *
 *     target = ((now() - anchor) / 1000) mod duration
 *
 * Nothing is triggered by the Play event arriving, so the server's ~0.6–1.1s
 * poll delay and its per-connection spread stop mattering: the event decides
 * whether it plays, never where. A screen that boots late computes the same
 * target as the other nine and joins mid-loop already in step.
 *
 * An anchor in the future is a scheduled start: the element holds on its first
 * frame until that instant arrives. This is what makes Restart work — the
 * command is deliberately delivered early so every screen can wait for the same
 * moment rather than each starting when its own message happens to land.
 */
export function SyncedVideo({
  src,
  anchor = 0,
  pausedAt = 0,
  playStatus,
  fit = 'cover',
  audio = false,
  onDiagnostics,
}) {
  const ref = useRef(null)
  const diagnosticsRef = useRef(null)
  const hasPlayedRef = useRef(false)

  /**
   * Sound is a request, not a guarantee: browsers reject `play()` outright on an
   * unmuted element that no user gesture has touched. `soundBlocked` records
   * that refusal so the screen can drop to muted playback and carry on — a
   * silent wall is a far better failure than a black one.
   *
   * Kiosk (`--autoplay-policy=no-user-gesture-required`) means this never trips.
   */
  const [soundBlocked, setSoundBlocked] = useState(false)
  const wantSound = Boolean(audio) && !soundBlocked

  // Read inside the correction tick, which must not re-arm when sound changes.
  const wantSoundRef = useRef(wantSound)

  useEffect(() => {
    wantSoundRef.current = wantSound
  }, [wantSound])

  useEffect(() => {
    diagnosticsRef.current = onDiagnostics
  }, [onDiagnostics])

  // Keyed by src so switching media resets during render rather than in an
  // effect — the previous video must never be shown against the new source.
  const [load, setLoad] = useState({ src, playbackUrl: null, error: null })
  if (load.src !== src) setLoad({ src, playbackUrl: null, error: null })
  const { playbackUrl, error } = load

  useEffect(() => {
    let cancelled = false
    const settle = (fields) =>
      !cancelled && setLoad((prev) => (prev.src === src ? { ...prev, ...fields } : prev))

    // Download the whole file before playing a frame of it. Streaming leaves the
    // network in the playback path, which is what makes a screen stutter part
    // way through; from a blob, seeking and looping are memory operations.
    if (!config.media.preferBlobPlayback) {
      settle({ playbackUrl: src })
      return () => {
        cancelled = true
      }
    }

    preloadMedia(src, (progress) => diagnosticsRef.current?.({ preload: progress.ratio }))
      .then((url) => settle({ playbackUrl: url }))
      .catch(() => settle({ playbackUrl: src })) // fall back to streaming it
    return () => {
      cancelled = true
    }
  }, [src])

  const playing = playStatus !== PLAY_STATUS.PAUSE

  /**
   * Muting is driven imperatively rather than through the JSX attribute: React
   * only writes `muted` on the initial mount (it is a property, not a reflected
   * attribute), so a later flip from muted to audible would never reach the
   * element.
   *
   * `preservesPitch` matters because drift correction moves `playbackRate`. Left
   * off, every correction shifts the pitch of the soundtrack — ten panels each
   * sliding a few percent in different directions turns a music bed into a
   * chorus of slightly detuned copies.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = !wantSound
    el.preservesPitch = true
    if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true
  }, [wantSound, playbackUrl])

  // If sound was refused, take the first gesture anywhere on the panel as
  // permission to try again. ScreenFrame's tap-to-fullscreen is one of these,
  // so a single tap on a non-kiosk screen both fills it and turns the sound on.
  useEffect(() => {
    if (!audio || !soundBlocked) return undefined

    const retry = () => setSoundBlocked(false)
    const opts = { once: true, passive: true }
    window.addEventListener('pointerdown', retry, opts)
    window.addEventListener('keydown', retry, opts)
    return () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
    }
  }, [audio, soundBlocked])

  useEffect(() => {
    const el = ref.current
    if (!el || !playbackUrl) return undefined

    const { softDrift, hardSeek, maxRateAdjust, correctionMs } = config.sync
    const tuning = isWebKitMedia ? config.sync.webkit : null
    const soft = tuning?.softDrift ?? softDrift
    const maxRate = tuning?.maxRateAdjust ?? maxRateAdjust
    const tick = tuning?.correctionMs ?? correctionMs

    let startTimer = null
    let interval = null
    let lastDropped = null

    const duration = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0)

    const positionAt = (instant) => {
      const total = duration()
      if (!total) return 0
      const elapsed = (instant - anchor) / 1000
      return elapsed <= 0 ? 0 : elapsed % total
    }

    const target = () => positionAt(now())

    // Writing playbackRate is not free — on WebKit it can cost a frame — so it
    // is only touched when the value actually needs to move.
    const setRate = (rate) => {
      if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate
    }

    const correct = () => {
      const total = duration()
      if (!total || now() < anchor) return

      // A screen that cannot decode in real time keeps falling behind. Seeking
      // it every tick turns a slow screen into a stuttering one, so while the
      // pipeline is starved, leave it alone and let it recover.
      if (el.readyState < 3) return

      /**
       * The same rule, but for the case `readyState` cannot see.
       *
       * A panel can report HAVE_ENOUGH_DATA and still be dropping frames — the
       * buffer is full, the decoder just cannot keep up with it. Left alone,
       * that becomes a feedback loop with teeth: decode falls behind → drift
       * grows past `hardSeek` → we seek → the seek flushes the decoder → it
       * falls further behind → we seek again. A panel that was merely slow ends
       * up seeking every tick, which is far more visible than the drift ever was.
       *
       * Dropped frames are the honest signal, so while they are climbing we do
       * nothing at all and let the decoder recover. The drift is a symptom of
       * the starvation; a seek cannot fix it and makes the next second worse.
       */
      const quality = el.getVideoPlaybackQuality?.()
      if (quality) {
        const dropped = quality.droppedVideoFrames
        const delta = lastDropped == null ? 0 : dropped - lastDropped
        lastDropped = dropped

        // Frames this tick should have shown, at the source's 24fps.
        const budget = Math.max(2, 24 * (tick / 1000) * 0.15)
        diagnosticsRef.current?.({ dropped: delta })
        if (delta > budget) return
      }

      const position = target()
      let drift = el.currentTime - position
      // Near the loop seam the shorter way round may be across the boundary.
      if (drift > total / 2) drift -= total
      else if (drift < -total / 2) drift += total

      // Tighter when audible: a ±5% rate slide that is invisible in the picture
      // is clearly audible in the soundtrack.
      const rateCap = wantSoundRef.current
        ? Math.min(maxRate, config.sync.audioMaxRateAdjust)
        : maxRate

      if (Math.abs(drift) > hardSeek) {
        el.currentTime = position
        setRate(1)
      } else if (Math.abs(drift) > soft) {
        setRate(1 + Math.max(-rateCap, Math.min(rateCap, -drift)))
      } else {
        setRate(1)
      }

      diagnosticsRef.current?.({ drift })
    }

    const begin = () => {
      if (duration()) el.currentTime = target()
      hasPlayedRef.current = true

      el.play().catch(() => {
        // Almost always the autoplay policy refusing an unmuted element. Drop
        // the sound and start anyway — the wall must not go black over audio.
        if (!el.muted) {
          setSoundBlocked(true)
          el.muted = true
          el.play().catch(() => {})
        }
      })

      interval = setInterval(correct, tick)
    }

    const arm = () => {
      if (!playing) {
        el.pause()
        setRate(1)
        // Deliberately no seek. The pause arrives up to a second after it was
        // issued, so aligning to that instant means rewinding by that much —
        // a visible jump backwards on every pause. A screen that was playing is
        // already within the delivery spread of the right frame, which is close
        // enough; only a screen that booted while paused needs positioning.
        if (pausedAt && duration() && !hasPlayedRef.current) {
          try {
            el.currentTime = positionAt(pausedAt)
          } catch {
            /* metadata not ready yet */
          }
        }
        return
      }
      const wait = anchor - now()
      if (wait > 0) {
        // Scheduled start: hold the first frame until the shared instant.
        el.pause()
        try {
          el.currentTime = 0
        } catch {
          /* metadata not ready; the start below seeks again anyway */
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
  }, [playbackUrl, anchor, pausedAt, playing])

  if (error) {
    return (
      <div className="grid h-full w-full place-items-center bg-black px-12 text-center">
        <p className="text-sm text-ink-400">{error}</p>
      </div>
    )
  }

  return (
    <video
      ref={ref}
      src={playbackUrl || undefined}
      className={`h-full w-full bg-black ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      playsInline
      // Initial value only — the effect above owns this from then on. Starting
      // muted keeps the very first play() attempt inside what every autoplay
      // policy allows; sound is turned on once it is actually playing.
      muted
      loop
      preload="auto"
      disablePictureInPicture
      controls={false}
    />
  )
}
