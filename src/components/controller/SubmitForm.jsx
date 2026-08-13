import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Input, Label } from '../ui/Field.jsx'
import { SendIcon } from '../ui/Icons.jsx'
import { isPlayableUrl, resolveMedia } from '../../lib/media.js'

/** The controller's primary action: paste a URL, send it to the screen. */
export function SubmitForm({ onSubmit, pending, disabled }) {
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)

  const valid = isPlayableUrl(url)
  const invalid = touched && url.length > 0 && !valid
  const media = valid ? resolveMedia(url) : null

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || disabled) return

    const result = await onSubmit(url.trim())
    if (result) {
      setUrl('')
      setTouched(false)
    }
  }

  return (
    <form onSubmit={submit} className="surface hairline rounded-2xl p-5 sm:p-6">
      <div className="space-y-2.5">
        <Label hint={media ? media.label : null}>Media URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
          invalid={invalid}
          placeholder="https://…/video.mp4"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
        <motion.div
          initial={false}
          animate={{ height: invalid ? 'auto' : 0, opacity: invalid ? 1 : 0 }}
          className="overflow-hidden"
        >
          <p className="text-[12px] text-danger">Enter a full http(s) URL.</p>
        </motion.div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-5 w-full"
        disabled={disabled || !valid}
        loading={pending === 'play'}
      >
        Send to screen
        <SendIcon width={18} height={18} />
      </Button>
    </form>
  )
}
