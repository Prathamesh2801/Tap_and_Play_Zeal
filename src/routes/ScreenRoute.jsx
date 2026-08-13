import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FittedCanvas, ScreenFrame } from '../components/screen/ScreenFrame.jsx'
import { IdleScreen } from '../components/screen/IdleScreen.jsx'
import { MediaStage } from '../components/screen/MediaStage.jsx'
import { ScreenPulse } from '../components/screen/ScreenPulse.jsx'
import { SyncBadge } from '../components/screen/SyncBadge.jsx'
import { SystemSetup } from '../components/SystemSetup.jsx'
import { useSystemChannel } from '../hooks/useSystemChannel.js'
import { useSysNo } from '../hooks/useSysNo.js'
import { isPlayableUrl, mediaKey } from '../lib/media.js'
import { clockState, onClockChange, startClockSync } from '../lib/clock.js'
import { isCached, preloadMedia } from '../lib/videoCache.js'
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
 * Idle is deliberately black — the first frame of video has to arrive as a
 * reveal, and anything drawn before it spoils that. The only mark on it is a
 * tiny corner readout of stream and cache state (see ScreenPulse), which is a
 * commissioning aid, not screen content.
 *
 * Query options (after the hash, e.g. `#/screen/1?debug=1`):
 *   fit=cover|contain   fill the panel by cropping (default), or letterbox.
 *   aspect=W:H          embeds only — the source ratio, to crop the player's bars.
 *   pair=1              show the system number and pairing QR instead of black.
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
  const pairing = params.get('pair') === '1'

  const [clock, setClock] = useState(clockState)
  const [diagnostics, setDiagnostics] = useState({ drift: 0 })

  // One row per bundled video, so a wall being commissioned shows which clips a
  // given panel is already holding rather than a single blended percentage.
  const [library, setLibrary] = useState(() =>
    config.bundledVideos.map((video) => ({
      key: video.key,
      title: video.title,
      ratio: isCached(video.src) ? 1 : 0,
      ready: isCached(video.src),
      failed: false,
    })),
  )

  // Sync to the server clock before anything plays, and keep re-syncing.
  useEffect(() => {
    const unsubscribe = onClockChange(setClock)
    const stop = startClockSync()
    return () => {
      unsubscribe()
      stop()
    }
  }, [])

  // Download every bundled video the moment the screen is bound to a system —
  // long before anything asks to play one. A screen powered up hours early is
  // already holding both files, so playback never touches the network and
  // switching clips mid-event is instant on all ten panels.
  //
  // One at a time, deliberately: ten screens each pulling both files at once
  // through a single router is the slowest way to get all of them ready, and it
  // leaves every screen half-cached instead of the first clip cached everywhere.
  useEffect(() => {
    if (!ready) return undefined
    let cancelled = false

    const patch = (key, fields) => {
      if (cancelled) return
      setLibrary((prev) => prev.map((row) => (row.key === key ? { ...row, ...fields } : row)))
    }

    ;(async () => {
      for (const video of config.bundledVideos) {
        if (cancelled) return
        try {
          await preloadMedia(video.src, ({ ratio }) => patch(video.key, { ratio }))
          patch(video.key, { ratio: 1, ready: true, failed: false })
        } catch {
          // Leave it marked failed and carry on; the player falls back to
          // streaming this one clip rather than the screen showing nothing.
          patch(video.key, { failed: true })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready])

  // Whole-library progress, for the debug badge.
  const cached = library.length
    ? library.reduce((sum, row) => sum + (row.ready ? 1 : row.ratio), 0) / library.length
    : 1

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
            className="absolute inset-0 bg-black"
          >
            {pairing ? (
              <FittedCanvas>
                <IdleScreen sysNo={sysNo} status={status} note={rejected} library={library} />
              </FittedCanvas>
            ) : (
              // Black, and nothing else. The readout is the single exception.
              <ScreenPulse sysNo={sysNo} status={status} note={rejected} library={library} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {debug && <SyncBadge clock={clock} drift={diagnostics.drift} preload={cached} library={library} />}
    </ScreenFrame>
  )
}
