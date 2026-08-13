import { motion } from 'framer-motion'

const TONE = {
  open: { color: 'bg-live', label: 'Live', pulse: true },
  connecting: { color: 'bg-ink-300', label: 'Connecting', pulse: true },
  reconnecting: { color: 'bg-ink-300', label: 'Reconnecting', pulse: true },
  stale: { color: 'bg-danger', label: 'Stalled', pulse: true },
  closed: { color: 'bg-ink-500', label: 'Offline', pulse: false },
  idle: { color: 'bg-ink-500', label: 'Idle', pulse: false },
}

export function StatusDot({ status = 'idle', label, className = '' }) {
  const tone = TONE[status] ?? TONE.idle
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        {tone.pulse && (
          <motion.span
            className={`absolute inset-0 rounded-full ${tone.color}`}
            animate={{ scale: [1, 2.6, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${tone.color}`} />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">
        {label ?? tone.label}
      </span>
    </span>
  )
}
