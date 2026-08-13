import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SubmitForm } from '../components/controller/SubmitForm.jsx'
import { PlaybackBar } from '../components/controller/PlaybackBar.jsx'
import { SystemSetup } from '../components/SystemSetup.jsx'
import { StatusDot } from '../components/ui/StatusDot.jsx'
import { ScreenIcon } from '../components/ui/Icons.jsx'
import { useSystemChannel } from '../hooks/useSystemChannel.js'
import { useSystemActions } from '../hooks/useSystemActions.js'
import { useSysNo } from '../hooks/useSysNo.js'
import { Button } from '../components/ui/Button.jsx'
import { withSync } from '../lib/media.js'
import { now, startClockSync } from '../lib/clock.js'
import { config } from '../lib/config.js'

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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={reset}
          className="-ml-2 rounded-lg p-2 text-[13px] text-ink-400 transition-colors hover:text-ink-050"
        >
          Change system
        </button>

        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <Link
            to={`/screen/${sysNo}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-2 text-ink-400 transition-colors hover:text-ink-050"
            title="Open this system's screen"
          >
            <ScreenIcon width={18} height={18} />
          </Link>
        </div>
      </header>

      <div className="mt-5 flex items-baseline gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-500">System</span>
        <h1 className="font-mono text-[34px] leading-none tracking-widest text-ink-050">{sysNo}</h1>
      </div>

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

      <div className="mt-5 space-y-4">
        {/* This loads the bundled clip and starts it from zero. It is not a
            resume — that is the play/pause control below — so it says so. */}
        <Button
          size="lg"
          className="w-full"
          disabled={!isLive}
          loading={actions.pending === 'play'}
          onClick={() =>
            actions.play(withSync(config.defaultMedia, { anchor: now() + config.sync.restartLeadMs }))
          }
        >
          Load bundled video (from start)
        </Button>

        <SubmitForm onSubmit={actions.play} pending={actions.pending} disabled={!isLive} />
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
    </main>
  )
}
