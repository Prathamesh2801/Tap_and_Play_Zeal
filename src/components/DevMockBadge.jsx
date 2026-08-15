import { config } from '../lib/config.js'
import { mockReset } from '../lib/mockBackend.js'

/**
 * A permanent, unmissable marker that the app is NOT talking to the real
 * backend.
 *
 * The whole failure mode this guards against is shipping a build — or worse,
 * commissioning a wall — with `devMock.enabled` still true: every screen would
 * connect, report healthy, and simply never hear from the controller in the next
 * room. It renders nothing at all when the flag is off, so the live build is
 * untouched.
 *
 * Bottom-left, because the screen's own commissioning readout (ScreenPulse)
 * sits top-left and the two should not overlap.
 */
export function DevMockBadge() {
  if (!config.devMock.enabled) return null

  const [minLag, maxLag] = config.devMock.deliveryMs

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-[9999] p-2 font-mono text-[10px] leading-tight">
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-950/80 px-2 py-1 text-amber-300/90 backdrop-blur-sm">
        <span className="font-medium uppercase tracking-[0.14em]">Dev mock</span>
        <span className="text-amber-300/50">
          no server · {Math.round(minLag)}–{Math.round(maxLag)}ms
        </span>
        <button
          type="button"
          // The screen shell turns any click into a fullscreen request; this
          // button is inside it and must not trigger that as well.
          onClick={(event) => {
            event.stopPropagation()
            mockReset()
          }}
          className="rounded border border-amber-400/30 px-1.5 py-0.5 text-amber-200/80 transition-colors hover:bg-amber-400/15 hover:text-amber-100"
          title="Clear every mocked system back to idle"
        >
          reset
        </button>
      </div>
    </div>
  )
}
