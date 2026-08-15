import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SubmitForm } from '../components/controller/SubmitForm.jsx'
import { PlaybackBar } from '../components/controller/PlaybackBar.jsx'
import { VideoLibrary } from '../components/controller/VideoLibrary.jsx'
import { AudioOutput } from '../components/controller/AudioOutput.jsx'
import { SystemSetup } from '../components/SystemSetup.jsx'
import { StatusDot } from '../components/ui/StatusDot.jsx'
import { ScreenIcon } from '../components/ui/Icons.jsx'
import { useSystemChannel } from '../hooks/useSystemChannel.js'
import { useSystemActions } from '../hooks/useSystemActions.js'
import { useSysNo } from '../hooks/useSysNo.js'
import { bundledKey, withSync } from '../lib/media.js'
import { now, startClockSync } from '../lib/clock.js'
import { preloadMedia } from '../lib/videoCache.js'
import { activeVideos, bundledUrl, config } from '../lib/config.js'

/** The phone. Writes to data.php, mirrors what sse.php reports back. */
export default function ControllerRoute() {
  const { sysNo: bound, ready, accept, reset } = useSysNo('controller')
  const { sysNo, snapshot, status, isLive, rejected } = useSystemChannel(bound, { enabled: ready })
  const actions = useSystemActions(sysNo)

  // The controller stamps restart anchors, so its clock must agree with the
  // screens' — otherwise it schedules an instant they read differently. It only
  // needs to be right to a few tens of ms against a 2.5s lead, so it settles for
  // a single boundary and a wider spacing rather than a burst of requests.
  useEffect(() => startClockSync({ attempts: 50, spacing: 40, crossings: 1 }), [])

  // Pull every room-audio track into memory up front, the same way each screen
  // pre-caches every clip. Fetching a track only when it is first selected means
  // the wall starts on time and the speakers come in late — the anchor maths
  // would place the audio correctly the moment it arrived, but the opening
  // second would be silent. One at a time, for the same reason the screens do it
  // sequentially: this laptop is also serving ten panels their video.
  useEffect(() => {
    if (!ready) return undefined
    let cancelled = false

    ;(async () => {
      for (const video of activeVideos()) {
        if (cancelled) return
        if (!video.audioSrc) continue
        // A failure here is not worth surfacing: SyncedAudio re-requests the
        // track on selection and falls back to streaming it.
        await preloadMedia(video.audioSrc).catch(() => {})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready])

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center px-5 py-10">
        <SystemSetup
          title="Connect to a screen"
          subtitle="Enter the system number shown on the screen, or scan its QR code."
          onReady={accept}
        />
      </main>
    )
  }

  const notice = actions.error || rejected || (status !== 'open' ? 'Reconnecting to the system…' : null)
  const isError = Boolean(actions.error || rejected)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6 sm:max-w-xl sm:px-6 sm:pt-8 lg:max-w-5xl lg:px-8 lg:pb-12">
      {/* One row from the smallest phone up: identity left, state and exits
          right. The eyebrow is the only thing that goes, and only where the
          number would otherwise be crowded. */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.28em] text-ink-500 sm:inline">
            System
          </span>
          <h1 className="truncate font-mono text-[32px] leading-none tracking-widest text-ink-050 sm:text-[38px] lg:text-[44px]">
            {sysNo}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <StatusDot status={status} className="mr-1" />
          <Link
            to={`/screen/${sysNo}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-2 text-ink-400 transition-colors hover:text-ink-050"
            title="Open this system's screen"
          >
            <ScreenIcon width={18} height={18} />
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg p-2 text-[13px] text-ink-400 transition-colors hover:text-ink-050"
          >
            Change
            <span className="hidden sm:inline"> system</span>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p
              className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${
                isError
                  ? 'border-danger/25 bg-danger/10 text-danger'
                  : 'border-ink-700 bg-ink-800/60 text-ink-300'
              }`}
            >
              {notice}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        One column on a phone, in the order you reach for things: pick a clip,
        drive it, then the escape hatch for an arbitrary URL.

        From `lg` the same three panels become two columns — picking on the
        left, transport on the right where it stays put as the page scrolls.
        Placement is set per panel rather than by wrapping each column in a div,
        so the phone order stays exactly the DOM order above.
      */}
      <div className="mt-6 grid gap-4 sm:mt-7 sm:gap-5 lg:mt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-6">
        {/* Pick a bundled clip. Every screen already holds all of them, so this
            only names one — and it starts from zero on a shared instant, which
            is not a resume; that is the play/pause control. */}
        <div className="lg:col-start-1 lg:row-start-1">
          <VideoLibrary
            videos={activeVideos()}
            currentKey={bundledKey(snapshot.url)}
            onLoad={(key) =>
              actions.play(withSync(bundledUrl(key), { anchor: now() + config.sync.restartLeadMs }))
            }
            pending={actions.pending}
            disabled={!isLive}
          />
        </div>

        <div className="lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">
          <PlaybackBar
            snapshot={snapshot}
            shownStatus={actions.resolveStatus(snapshot.playStatus)}
            restartScheduled={actions.restartScheduled}
            onToggle={actions.toggle}
            onRestart={actions.restart}
            onStop={actions.stop}
            pending={actions.pending}
            disabled={!isLive}
          />
        </div>

        {/* Directly under the transport, because it is the same idea — what is
            happening right now — even though it is the one panel that writes
            nothing to the server. */}
        <div className="lg:col-start-2 lg:row-start-2">
          <AudioOutput snapshot={snapshot} />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <SubmitForm onSubmit={actions.play} pending={actions.pending} disabled={!isLive} />
        </div>
      </div>
    </main>
  )
}
