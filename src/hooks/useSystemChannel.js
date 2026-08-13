import { useEffect, useMemo, useState } from 'react'
import { createSystemStream } from '../lib/sseClient.js'
import { adaptSnapshot, EMPTY_SNAPSHOT } from '../lib/contract.js'
import { isValidSysNoFormat, normalizeSysNo } from '../lib/system.js'

const freshSession = (sysNo) => ({
  sysNo,
  snapshot: EMPTY_SNAPSHOT,
  status: 'idle', // connecting | open | reconnecting | closed
})

/**
 * Subscribes to sse.php for one SYS_NO and exposes the server's snapshot.
 *
 * The server is the single source of truth. The controller writes and then
 * waits for the echoed frame, so what the phone displays is always what the
 * screen is actually doing — two controllers on one system cannot drift.
 *
 * Everything lives in one session object keyed by SYS_NO, so switching systems
 * can never leave the previous system's media on screen beside the new one's
 * status.
 */
export function useSystemChannel(rawSysNo, { enabled = true } = {}) {
  const sysNo = normalizeSysNo(rawSysNo)
  const valid = isValidSysNoFormat(sysNo)

  const [session, setSession] = useState(() => freshSession(sysNo))

  // Reset during render (React's "adjust state on prop change" pattern) so a
  // stale system is never painted.
  if (session.sysNo !== sysNo) setSession(freshSession(sysNo))

  useEffect(() => {
    if (!valid || !enabled) return undefined

    let cancelled = false
    const patch = (fields) => {
      if (cancelled) return
      setSession((prev) => (prev.sysNo === sysNo ? { ...prev, ...fields } : prev))
    }

    const close = createSystemStream(sysNo, {
      onSnapshot: (raw) => patch({ snapshot: adaptSnapshot(raw) }),
      onStatus: (status) => patch({ status }),
    })

    return () => {
      cancelled = true
      close()
    }
  }, [sysNo, enabled, valid])

  const status = valid && enabled ? session.status : 'idle'
  const { snapshot } = session

  return useMemo(
    () => ({
      sysNo,
      valid,
      snapshot,
      status,
      isLive: status === 'open',
      /** True once the server has confirmed this system exists. */
      known: snapshot.receivedAt > 0 && snapshot.found,
      /** Set when the server explicitly rejected the SYS_NO. */
      rejected: snapshot.receivedAt > 0 && !snapshot.found ? snapshot.message : null,
    }),
    [sysNo, valid, snapshot, status],
  )
}
