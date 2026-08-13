import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from './ui/Button.jsx'
import { CodeInput } from './ui/Field.jsx'
import { isValidSysNoFormat, normalizeSysNo, readSysNo, storeSysNo } from '../lib/system.js'
import { validateSystemNo } from '../lib/sseClient.js'

/**
 * Captures SYS_NO at startup.
 *
 * The number is confirmed against sse.php before it is stored, so a typo fails
 * here — visibly, in two seconds — rather than becoming a screen that connects
 * fine and silently never plays anything.
 */
export function SystemSetup({ title, subtitle, onReady }) {
  const [value, setValue] = useState(readSysNo)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)

  const formatOk = isValidSysNoFormat(value)

  const submit = async (e) => {
    e.preventDefault()
    const sysNo = normalizeSysNo(value)
    if (!formatOk || checking) return

    setChecking(true)
    setError(null)

    const { valid, message } = await validateSystemNo(sysNo)
    setChecking(false)

    if (!valid) {
      setError(message)
      return
    }
    storeSysNo(sysNo)
    onReady(sysNo)
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onSubmit={submit}
      className="surface hairline w-full max-w-sm rounded-3xl p-7"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.42em] text-ink-500">Tap &amp; Play</p>
      <h1 className="mt-4 text-[22px] font-medium tracking-[-0.02em] text-ink-050">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">{subtitle}</p>

      <div className="mt-7">
        <CodeInput
          value={value}
          onChange={(e) => {
            setValue(normalizeSysNo(e.target.value))
            setError(null)
          }}
          inputMode="numeric"
          placeholder="—"
          autoFocus
          enterKeyHint="go"
          aria-label="System number"
          aria-invalid={Boolean(error) || undefined}
        />
      </div>

      <motion.p
        initial={false}
        animate={{ height: error ? 'auto' : 0, opacity: error ? 1 : 0 }}
        className="overflow-hidden text-[12px] text-danger"
      >
        <span className="block pt-2.5">{error}</span>
      </motion.p>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-5 w-full"
        disabled={!formatOk}
        loading={checking}
      >
        Continue
      </Button>

      <p className="mt-4 text-center text-[11px] text-ink-500">
        Saved on this device — you won&apos;t be asked again.
      </p>
    </motion.form>
  )
}
