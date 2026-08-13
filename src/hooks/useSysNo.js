import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { forgetSysNo, isValidSysNoFormat, normalizeSysNo, readSysNo, storeSysNo } from '../lib/system.js'

/**
 * Resolves which SYS_NO a surface is bound to, and keeps URL and localStorage
 * agreeing about it.
 *
 * Precedence is deliberate: the URL wins over storage, so a scanned QR or a
 * pasted link always takes you to the system it names — and that system then
 * becomes the remembered one. With neither present, `ready` is false and the
 * caller shows the setup gate.
 *
 * @param {'screen'|'controller'} surface
 */
export function useSysNo(surface) {
  const { sysNo: param } = useParams()
  const navigate = useNavigate()

  const fromRoute = normalizeSysNo(param)
  const routeHasSysNo = isValidSysNoFormat(fromRoute)

  const [remembered, setRemembered] = useState(readSysNo)
  const sysNo = routeHasSysNo ? fromRoute : remembered

  useEffect(() => {
    // Persist what the URL asked for, or put the remembered value into the URL
    // so the page is addressable and shareable.
    if (routeHasSysNo) storeSysNo(fromRoute)
    else if (isValidSysNoFormat(remembered)) navigate(`/${surface}/${remembered}`, { replace: true })
  }, [routeHasSysNo, fromRoute, remembered, surface, navigate])

  const accept = useCallback(
    (value) => {
      const next = normalizeSysNo(value)
      storeSysNo(next)
      setRemembered(next)
      navigate(`/${surface}/${next}`, { replace: true })
    },
    [surface, navigate],
  )

  const reset = useCallback(() => {
    forgetSysNo()
    setRemembered('')
    navigate(`/${surface}`, { replace: true })
  }, [surface, navigate])

  return { sysNo, ready: isValidSysNoFormat(sysNo), accept, reset }
}
