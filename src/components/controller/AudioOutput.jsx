import { useCallback, useState } from 'react'
import { SyncedAudio } from './SyncedAudio.jsx'
import { Button } from '../ui/Button.jsx'
import { bundledVideo } from '../../lib/config.js'
import { parseSync } from '../../lib/media.js'
import { PLAY_STATUS } from '../../lib/contract.js'

/**
 * Sound for the room, from this device.
 *
 * The panels play silent video; whatever is driving them is also what is plugged
 * into the speakers. This panel is the one piece of controller UI that is NOT a
 * write to data.php — it changes nothing on the wall and nothing on the server,
 * only what this laptop is sending to its own output. It says so plainly,
 * because a control that looks like the others but does not reach the screens
 * would be exactly the kind of UI-that-lies the rest of this app avoids.
 */
export function AudioOutput({ snapshot }) {
  const [muted, setMuted] = useState(false)
  const [blocked, setBlocked] = useState(false)

  // Identity-stable so it does not re-arm the sync effect on every render.
  const onBlocked = useCallback((value) => setBlocked(value), [])

  const entry = bundledVideo(snapshot.url)
  const track = entry?.audioSrc
  const { anchor, pausedAt } = parseSync(snapshot.url)
  const playing = snapshot.playStatus !== PLAY_STATUS.PAUSE

  return (
    <section className="surface hairline rounded-2xl p-5 sm:p-6">
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">
          Room audio
        </p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-500">
          {!track ? 'No track' : blocked ? 'Blocked' : muted ? 'Muted' : playing ? 'Playing' : 'Paused'}
        </p>
      </header>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        {!track ? (
          'This clip has no separate audio track. The screens play silent either way.'
        ) : (
          <>
            Playing from <span className="text-ink-100">this device</span>, in step with the wall.
            The screens stay silent on purpose — ten of them playing the same track a few
            milliseconds apart cancels into an echo.
          </>
        )}
      </p>

      {track && (
        <>
          <SyncedAudio
            key={entry.key}
            src={track}
            anchor={anchor}
            pausedAt={pausedAt}
            playStatus={snapshot.playStatus}
            muted={muted}
            onBlocked={onBlocked}
          />

          <div className="mt-4 flex items-center gap-2.5">
            {blocked ? (
              // The browser refused to start audio without a gesture. This
              // button IS the gesture — nothing else can rescue it.
              <Button variant="primary" className="h-12 flex-1 rounded-xl" onClick={() => setMuted(false)}>
                Enable sound
              </Button>
            ) : (
              <Button
                variant={muted ? 'primary' : 'ghost'}
                className="h-12 flex-1 rounded-xl"
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? 'Unmute this device' : 'Mute this device'}
              </Button>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            Local only — this does not reach the screens.
          </p>
        </>
      )}
    </section>
  )
}
