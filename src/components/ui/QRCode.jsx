import { useEffect, useState } from 'react'
import QR from 'qrcode'

/** Renders a value as a QR data-URL image. Fails silently — the code is shown as text too. */
export function QRCode({ value, size = 148, className = '' }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let alive = true
    if (!value) return undefined
    QR.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0bff', light: '#fafafaff' },
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [value, size])

  if (!src) {
    return <div style={{ width: size, height: size }} className={`rounded-xl bg-ink-800 ${className}`} />
  }
  return (
    <img
      src={src}
      alt="Scan to open the controller"
      width={size}
      height={size}
      className={`rounded-xl bg-ink-050 ${className}`}
    />
  )
}
