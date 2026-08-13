import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { config } from '../../lib/config.js'

/**
 * The TV shell.
 *
 * Sized with viewport units rather than `position: fixed`. Fixed positioning
 * resolves against the nearest *transformed* ancestor, not the viewport — and
 * every route here is wrapped in an animated container, so during a transition
 * the shell would silently start measuring itself against that wrapper's
 * content box instead of the screen.
 *
 * `?preview=1` swaps in a scaled device mock instead, for laying the design out
 * on a desktop without a 1480px-tall window.
 */
export function ScreenFrame({ children, preview = false }) {
  useWakeLock()
  useLockedViewport(!preview)
  const requestFullscreen = useTapFullscreen(!preview)

  if (preview) return <PreviewShell>{children}</PreviewShell>

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black" onClick={requestFullscreen}>
      {children}
    </div>
  )
}

/**
 * Scales a fixed design canvas to fit its parent without cropping.
 *
 * The canvas is centred by absolute positioning, NOT by grid/flex centring.
 * Grid centring silently fails here: the row grows to the item's own 1480px, so
 * item and grid area are the same height and `place-items: center` has nothing
 * left to centre. The grid's content then overflows the shorter container from
 * its top edge, and `transform: scale()` — which changes painting, not layout —
 * scales about a box centre sitting 740px down, far below the visible area. The
 * result is a design that looks cropped from the bottom, and worse the shorter
 * the window.
 *
 * Taking the canvas out of flow and pinning 50%/50% with a half-size pull-back
 * makes its centre coincide with the container's centre by construction,
 * whatever the size difference.
 */
export function FittedCanvas({ children, width = config.screen.width, height = config.screen.height }) {
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined

    const fit = () => {
      const { clientWidth, clientHeight } = el
      // A zero measurement means layout has not settled; keep the last good
      // scale rather than collapsing the design to nothing.
      if (clientWidth <= 0 || clientHeight <= 0) return
      setScale(Math.min(clientWidth / width, clientHeight / height))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <div
        style={{
          width,
          height,
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Desktop-only device mock. Never used on the panel itself. */
function PreviewShell({ children }) {
  const { width, height } = config.screen
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined

    const fit = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth <= 0 || clientHeight <= 0) return
      setScale(Math.min((clientWidth - 48) / width, (clientHeight - 48) / height, 1))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height])

  return (
    <div ref={wrapRef} className="relative h-dvh w-full overflow-hidden bg-ink-950">
      <div
        style={{
          width,
          height,
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center',
        }}
        className="overflow-hidden rounded-[28px] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_40px_120px_-20px_rgba(0,0,0,0.9)]"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Fullscreen, with no visible control.
 *
 * Browser chrome is the usual reason a panel looks cropped, and fullscreen is
 * the fix — but the API requires a user gesture, so it cannot be requested on
 * load. Rather than put a button on a screen that is meant to show nothing but
 * video, the whole surface is the gesture target: one tap on the panel during
 * setup and it goes edge to edge. Nothing is drawn, so nothing breaks the
 * illusion.
 *
 * Kiosk mode makes even that tap unnecessary.
 */
function useTapFullscreen(active) {
  return useCallback(() => {
    if (!active || document.fullscreenElement) return
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {
      // Denied or unsupported — the screen still works, just with chrome.
    })
  }, [active])
}

/** Signage screens must not sleep mid-playback. */
function useWakeLock() {
  useEffect(() => {
    let lock = null
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        // Unsupported or denied — harmless.
      }
    }
    request()
    const onVisible = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.().catch(() => {})
    }
  }, [])
}

/**
 * Stops the document itself from scrolling or rubber-banding behind the fixed
 * shell — without this, a stray overflow shows up as a screen that can be
 * dragged and appears cut off at the bottom.
 */
function useLockedViewport(active) {
  useEffect(() => {
    if (!active) return undefined
    const { body, documentElement: html } = document
    const previous = { bodyOverflow: body.style.overflow, htmlOverflow: html.style.overflow }

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previous.bodyOverflow
      html.style.overflow = previous.htmlOverflow
    }
  }, [active])
}
