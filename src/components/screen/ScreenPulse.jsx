import { motion } from 'framer-motion'

const TONE = {
  open: { dot: 'bg-live', text: 'text-live', label: 'live', pulse: true },
  connecting: { dot: 'bg-ink-300', text: 'text-ink-300', label: 'conn', pulse: true },
  reconnecting: { dot: 'bg-ink-300', text: 'text-ink-300', label: 'recon', pulse: true },
  stale: { dot: 'bg-danger', text: 'text-danger', label: 'stale', pulse: true },
  closed: { dot: 'bg-danger', text: 'text-danger', label: 'down', pulse: false },
  idle: { dot: 'bg-ink-400', text: 'text-ink-400', label: 'idle', pulse: false },
}

/**
 * The only thing drawn on an idle panel.
 *
 * The screen rests black so the first frame of video is a reveal, but a black
 * rectangle is indistinguishable from a dead browser, an unbound screen or one
 * still pulling video over the router. This answers exactly those three
 * questions — system, stream, cache — and nothing else.
 *
 * Deliberately tiny and dim: readable when you walk up to a panel during
 * commissioning, invisible from a few feet back.
 */
export function ScreenPulse({ sysNo, status, note, library = [] }) {
  const tone = TONE[status] ?? TONE.idle
  const ready = library.filter((row) => row.ready).length
  const failed = library.some((row) => row.failed)
  const allReady = library.length > 0 && ready === library.length

  return (
    <div className="absolute bottom-4 right-5 z-20 flex items-center gap-2 font-mono text-[10px] lowercase tracking-[0.12em] opacity-45">
      <span className="text-ink-400">{sysNo}</span>

      <span className="relative flex h-1 w-1">
        {tone.pulse && (
          <motion.span
            className={`absolute inset-0 rounded-full ${tone.dot}`}
            animate={{ scale: [1, 3, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={`relative h-1 w-1 rounded-full ${tone.dot}`} />
      </span>
      <span className={tone.text}>{tone.label}</span>

      {/* Cache: n/total while it fills, so a screen stuck part-way is obvious. */}
      <span className={failed ? 'text-danger' : allReady ? 'text-live' : 'text-ink-400'}>
        {failed ? 'cache err' : `${ready}/${library.length}`}
      </span>

      {/* A rejected system number is the one failure worth spelling out — the
          screen would otherwise sit black and apparently healthy forever. */}
      {note && <span className="max-w-[40vw] truncate text-danger">{note}</span>}
    </div>
  )
}
