import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FittedCanvas, ScreenFrame } from '../components/screen/ScreenFrame.jsx'
import { IdleScreen } from '../components/screen/IdleScreen.jsx'
import { MediaStage } from '../components/screen/MediaStage.jsx'
import { SyncBadge } from '../components/screen/SyncBadge.jsx'
import { SystemSetup } from '../components/SystemSetup.jsx'
import { useSystemChannel } from '../hooks/useSystemChannel.js'
import { useSysNo } from '../hooks/useSysNo.js'
import { isPlayableUrl, mediaKey, resolveMedia } from '../lib/media.js'
import { clockState, onClockChange, startClockSync } from '../lib/clock.js'
import { preloadMedia } from '../lib/videoCache.js'
import { config } from '../lib/config.js'

/** "9:16" or a bare decimal → width/height. Anything unparseable is ignored. */
function parseAspect(value) {
  if (!value) return null
  const [w, h] = String(value).split(':')
  const ratio = h === undefined ? Number(w) : Number(w) / Number(h)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/**
 * The TV. Read-only and chrome-free: once media is playing the panel shows the
 * video and nothing else.
 *
 * Query options (after the hash, e.g. `#/screen/1?debug=1`):
 *   fit=cover|contain   fill the panel by cropping (default), or letterbox.
 *   aspect=W:H          embeds only — the source ratio, to crop the player's bars.
 *   debug=1             show the clock/drift badge while commissioning a wall.
 *   preview=1           desktop device mock instead of a real full-bleed screen.
 */
export default function ScreenRoute() {
  const { sysNo: bound, ready, accept } = useSysNo('screen')
  const { sysNo, snapshot, status, rejected } = useSystemChannel(bound, { enabled: ready })
  const [params] = useSearchParams()

  const fit = params.get('fit') === 'contain' ? 'contain' : 'cover'
  const aspect = parseAspect(params.get('aspect'))
  const preview = params.get('preview') === '1'
  const debug = params.get('debug') === '1'

  const [clock, setClock] = useState(clockState)
  const [diagnostics, setDiagnostics] = useState({ drift: 0, preload: 0 })

  // Sync to the server clock before anything plays, and keep re-syncing.
  useEffect(() => {
    const unsubscribe = onClockChange(setClock)
    const stop = startClockSync()
    return () => {
      unsubscribe()
      stop()
    }
  }, [])

  // Download the bundled video the moment the screen is bound to a system —
  // long before anything asks to play it. A screen powered up hours early is
  // already holding the whole file, so playback never touches the network.
  useEffect(() => {
    if (!ready) return
    const media = resolveMedia(config.defaultMedia)
    if (!media.src) return
    preloadMedia(media.src, ({ ratio }) =>
      setDiagnostics((prev) => (prev.preload >= 1 ? prev : { ...prev, preload: ratio })),
    )
      .then(() => setDiagnostics((prev) => ({ ...prev, preload: 1 })))
      .catch(() => {})
  }, [ready])

  const onDiagnostics = useCallback((next) => {
    setDiagnostics((prev) => ({ ...prev, ...next }))
  }, [])

  const hasMedia = isPlayableUrl(snapshot.url)

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center px-5 py-10">
        <SystemSetup
          title="Set up this screen"
          subtitle="Enter the system number this screen should listen on."
          onReady={accept}
        />
      </main>
    )
  }

  return (
    <ScreenFrame preview={preview}>
      <AnimatePresence mode="wait">
        {hasMedia ? (
          <motion.div
            key={mediaKey(snapshot.url)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <MediaStage
              url={snapshot.url}
              playStatus={snapshot.playStatus}
              fit={fit}
              aspect={aspect}
              // Diagnostics tick twice a second; feeding them into React state
              // when nothing renders them re-rendered the whole tree at 2Hz,
              // which is exactly the jank being chased on a phone.
              onDiagnostics={debug ? onDiagnostics : undefined}
            />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <FittedCanvas>
              <IdleScreen
                sysNo={sysNo}
                status={status}
                note={rejected}
                preload={diagnostics.preload}
              />
            </FittedCanvas>
          </motion.div>
        )}
      </AnimatePresence>

      {debug && <SyncBadge clock={clock} drift={diagnostics.drift} preload={diagnostics.preload} />}
    </ScreenFrame>
  )
}
