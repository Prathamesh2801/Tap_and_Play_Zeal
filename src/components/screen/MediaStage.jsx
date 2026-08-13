import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseSync, resolveMedia } from '../../lib/media.js'
import { PLAY_STATUS } from '../../lib/contract.js'
import { SyncedVideo } from './SyncedVideo.jsx'

/**
 * The screen's only job: show the media, nothing else.
 *
 * There is deliberately no UI here — no controls, no titles, no prompts. The
 * panel is a display surface; everything that can be operated lives on the
 * phone. Anything drawn on top of the video breaks the illusion the screen
 * exists to create.
 *
 * Playback is muted, which is what lets it autoplay unattended, and looped, so
 * a quiet stream (only heartbeats, no state change) just keeps playing.
 */
export function MediaStage({ url, playStatus, fit = 'cover', aspect = null, onDiagnostics }) {
  const media = resolveMedia(url)

  if (media.kind === 'image') return <ImageStage media={media} fit={fit} />
  if (media.kind === 'youtube' || media.kind === 'vimeo') {
    return (
      <EmbedStage key={media.embedUrl} media={media} playStatus={playStatus} fit={fit} aspect={aspect} />
    )
  }

  // Direct video is the only source that can be genuinely frame-synced, so it
  // goes through the clock-driven player rather than a plain element.
  const sync = parseSync(url)
  return (
    <SyncedVideo
      key={media.src}
      src={media.src}
      anchor={sync.anchor}
      pausedAt={sync.pausedAt}
      playStatus={playStatus}
      fit={fit}
      onDiagnostics={onDiagnostics}
    />
  )
}

/**
 * YouTube / Vimeo.
 *
 * A cross-origin iframe cannot be touched through the DOM, so the player is
 * driven entirely over its postMessage API. Three things matter for keeping the
 * panel free of player UI:
 *
 * 1. Looping is done here, by seeking back to 0 when the player reports it has
 *    ended — NOT with `loop=1&playlist=<id>`, which turns the video into a
 *    playlist and makes YouTube draw previous/next buttons over it.
 * 2. `controls=0` removes the chrome; a transparent shield above the iframe and
 *    `pointer-events: none` on it guarantee no tap, hover or keyboard focus can
 *    ever summon it back.
 * 3. The player is muted and told to play as soon as it reports ready, so it
 *    never sits on a poster frame waiting for a gesture.
 *
 * YouTube only emits events after the parent sends a `listening` handshake,
 * which is what `onLoad` does.
 */
function EmbedStage({ media, playStatus, fit, aspect }) {
  const wrapRef = useRef(null)
  const frameRef = useRef(null)
  const [box, setBox] = useState(null)

  const isYouTube = media.kind === 'youtube'

  // `origin` is required for the JS API to accept commands from this page.
  const src = useMemo(() => {
    try {
      const parsed = new URL(media.embedUrl)
      if (isYouTube) parsed.searchParams.set('origin', window.location.origin)
      return parsed.toString()
    } catch {
      return media.embedUrl
    }
  }, [media.embedUrl, isYouTube])

  const send = useCallback(
    (payload) => {
      try {
        frameRef.current?.contentWindow?.postMessage(JSON.stringify(payload), media.origin)
      } catch {
        // Cross-origin refusal: the embed keeps playing under its own settings.
      }
    },
    [media.origin],
  )

  const command = useCallback((func, args = []) => send({ event: 'command', func, args }), [send])

  /**
   * Sizing. Without knowing the source video's true aspect ratio we cannot crop
   * the player's own letterbox away — a Short can contain landscape footage, so
   * guessing from the URL gets it wrong and adds bars rather than removing them.
   * The frame therefore fills the panel exactly, unless an explicit `?aspect=`
   * is given, in which case it is sized to cover/contain at that ratio.
   */
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined

    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!aspect) {
        setBox({ width: w, height: h })
        return
      }
      const width = fit === 'contain' ? Math.min(w, h * aspect) : Math.max(w, h * aspect)
      const height = fit === 'contain' ? Math.min(h, w / aspect) : Math.max(h, w / aspect)
      setBox({ width, height })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [aspect, fit])

  // Player events: start muted playback, and loop by seeking rather than by
  // becoming a playlist.
  useEffect(() => {
    if (!isYouTube) return undefined

    const onMessage = (event) => {
      if (event.origin !== media.origin || event.source !== frameRef.current?.contentWindow) return

      let data
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      if (data?.event === 'onReady') {
        command('mute')
        if (playStatus === PLAY_STATUS.PLAY) command('playVideo')
      }
      // info 0 === ENDED
      if (data?.event === 'onStateChange' && data?.info === 0) {
        command('seekTo', [0, true])
        command('playVideo')
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isYouTube, media.origin, command, playStatus])

  useEffect(() => {
    if (isYouTube) command(playStatus === PLAY_STATUS.PLAY ? 'playVideo' : 'pauseVideo')
    else send({ method: playStatus === PLAY_STATUS.PLAY ? 'play' : 'pause' })
  }, [playStatus, isYouTube, command, send])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
      {box && (
        <iframe
          ref={frameRef}
          src={src}
          title=""
          aria-hidden
          tabIndex={-1}
          onLoad={() => {
            // YouTube stays silent until the parent asks to listen.
            if (isYouTube) send({ event: 'listening', channel: 'widget' })
          }}
          style={{
            width: box.width,
            height: box.height,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          className="pointer-events-none absolute border-0"
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      )}
      {/* Shield: nothing reaches the player, so its chrome is never summoned. */}
      <div className="absolute inset-0 z-10" />
    </div>
  )
}

function ImageStage({ media, fit }) {
  return (
    <img
      src={media.src}
      alt=""
      className={`h-full w-full bg-black ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
    />
  )
}
