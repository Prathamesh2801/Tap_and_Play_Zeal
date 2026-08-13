/**
 * Commissioning aid for a multi-screen wall: `?debug=1`.
 *
 * Walk the row and every screen should show the same clock source, a small
 * accuracy figure, and a drift near zero. Hidden by default — the panel is meant
 * to show nothing but video.
 */
export function SyncBadge({ clock, drift, preload, library = [] }) {
  const ms = (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}ms`

  return (
    <div className="absolute left-4 top-4 z-20 rounded-lg bg-black/75 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-200 backdrop-blur-sm">
      <div>
        clock <span className={clock.source === 'server' ? 'text-live' : 'text-danger'}>{clock.source}</span>
        {clock.accuracy != null && ` ±${clock.accuracy}ms`}
      </div>
      <div>offset {ms(clock.offset)}</div>
      <div>
        drift{' '}
        <span className={Math.abs(drift * 1000) > 50 ? 'text-danger' : 'text-live'}>
          {ms(drift * 1000)}
        </span>
      </div>
      <div>preload {Math.round(preload * 100)}%</div>
      {library.map((row) => (
        <div key={row.key}>
          {row.key}{' '}
          <span className={row.failed ? 'text-danger' : row.ready ? 'text-live' : undefined}>
            {row.failed ? 'failed' : row.ready ? 'cached' : `${Math.round(row.ratio * 100)}%`}
          </span>
        </div>
      ))}
    </div>
  )
}
