import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { PauseIcon, PlayIcon, RestartIcon, StopIcon } from '../ui/Icons.jsx'
import { PLAY_STATUS } from '../../lib/contract.js'
import { displayTitle, isPlayableUrl, resolveMedia } from '../../lib/media.js'

/**
 * Play / pause / clear — the complete set of transport the backend models.
 * Nothing here is faked locally: every control maps to a real data.php write.
 */
export function PlaybackBar({
  snapshot,
  shownStatus,
  restartScheduled,
  onToggle,
  onRestart,
  onStop,
  pending,
  disabled,
}) {
  const hasMedia = isPlayableUrl(snapshot.url)
  const playing = shownStatus !== PLAY_STATUS.PAUSE

  const confirming = shownStatus !== snapshot.playStatus

  return (
    <section className="surface hairline rounded-2xl p-5 sm:p-6">
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">On screen</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-500">
          {!hasMedia ? 'Idle' : confirming ? `${shownStatus}…` : snapshot.playStatus}
        </p>
      </header>

      <motion.p
        key={snapshot.url || 'idle'}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`mt-2 truncate text-[17px] font-medium tracking-[-0.01em] sm:text-[19px] ${
          hasMedia ? 'text-ink-050' : 'text-ink-500'
        }`}
      >
        {hasMedia ? displayTitle(snapshot.url) : 'Nothing playing'}
      </motion.p>

      {hasMedia && (
        <p className="mt-1 truncate text-[11px] uppercase tracking-[0.12em] text-ink-500">
          {resolveMedia(snapshot.url).label}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2.5">
        <Button
          variant="primary"
          size="icon"
          className="h-14 flex-1 rounded-2xl"
          disabled={disabled || !hasMedia}
          onClick={() => onToggle(snapshot.url, shownStatus)}
        >
          {playing ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
          <span className="ml-2.5 text-sm">{playing ? 'Pause' : 'Play'}</span>
        </Button>

        <Button
          size="icon"
          className="h-14 w-14 rounded-2xl"
          disabled={disabled || !hasMedia}
          loading={pending === 'restart' || restartScheduled}
          onClick={() => onRestart(snapshot.url)}
          aria-label="Restart every screen together"
          title="Restart every screen together"
        >
          <RestartIcon />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-14 w-14 rounded-2xl"
          disabled={disabled || !hasMedia}
          loading={pending === 'stop'}
          onClick={onStop}
          aria-label="Clear the screen"
          title="Clear the screen"
        >
          <StopIcon width={18} height={18} />
        </Button>
      </div>
    </section>
  )
}
