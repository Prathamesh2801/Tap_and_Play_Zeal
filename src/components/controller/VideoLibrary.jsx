import { useState } from 'react'
import { motion } from 'framer-motion'
import { Spinner } from '../ui/Button.jsx'
import { CheckIcon, PlayIcon, RestartIcon } from '../ui/Icons.jsx'

/**
 * Choose which bundled clip the wall plays.
 *
 * Every screen has already downloaded all of these before this list is ever
 * used (see ScreenRoute), so picking one is a switch, not a download — the only
 * thing crossing the network is the short instruction naming it.
 *
 * Loading a clip always starts it from zero on a shared future instant, which is
 * why the wording says so: it is not a resume. Resume lives on the transport
 * controls below this list.
 */
export function VideoLibrary({ videos, currentKey, onLoad, pending, disabled }) {
  const [requested, setRequested] = useState('')

  const load = (key) => {
    setRequested(key)
    onLoad(key)
  }

  return (
    <section className="surface hairline rounded-2xl p-5 sm:p-6">
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">Video library</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-500">
          {videos.length} on every screen
        </p>
      </header>

      {/* Two-up as soon as there is width for it — a tablet or a desktop should
          not show a phone's single stacked column of short rows. */}
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-3">
        {videos.map((video) => {
          const current = video.key === currentKey
          const loading = pending === 'play' && requested === video.key

          return (
            <li key={video.key} className="h-full">
              <motion.button
                type="button"
                whileTap={disabled ? undefined : { scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                disabled={disabled}
                onClick={() => load(video.key)}
                className={`flex h-full w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-4 sm:py-4 ${
                  current
                    ? 'border-ink-500 bg-ink-800/70'
                    : 'border-ink-700 bg-ink-900/40 hover:border-ink-500 hover:bg-ink-800/50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink-050">
                      {video.title}
                    </span>
                    {current && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-live">
                        <CheckIcon width={11} height={11} />
                        On screen
                      </span>
                    )}
                  </span>
                  {video.note && (
                    <span className="mt-0.5 block truncate text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      {video.note}
                    </span>
                  )}
                </span>

                {/* The whole row is the button, so this is only its affordance —
                    a nested <button> would be invalid markup. */}
                <span
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium ${
                    current ? 'surface hairline text-ink-100' : 'bg-ink-050 text-ink-950'
                  }`}
                >
                  {loading ? (
                    <Spinner />
                  ) : current ? (
                    <RestartIcon width={15} height={15} />
                  ) : (
                    <PlayIcon width={13} height={13} />
                  )}
                  {current ? 'Restart' : 'Play'}
                </span>
              </motion.button>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
        Starts from the beginning on every screen at once.
      </p>
    </section>
  )
}
