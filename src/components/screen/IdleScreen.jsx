import { motion } from 'framer-motion'
import { QRCode } from '../ui/QRCode.jsx'
import { StatusDot } from '../ui/StatusDot.jsx'
import { controllerUrl } from '../../lib/system.js'

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
}

/** The TV's resting state: the system number, a QR to its controller, a live badge. */
export function IdleScreen({ sysNo, status, note, preload = 0 }) {
  const cached = preload >= 1
  const link = controllerUrl(sysNo)

  return (
    <div className="relative flex h-full w-full flex-col justify-between px-16 py-20">
      <Ambience />

      <motion.header initial="hidden" animate="show" variants={rise} custom={0} className="relative">
        <p className="text-[13px] font-medium uppercase tracking-[0.42em] text-ink-500">Tap &amp; Play</p>
        <div className="mt-5 h-px w-full bg-linear-to-r from-ink-600 via-ink-700 to-transparent" />
      </motion.header>

      <div className="relative flex flex-col items-center gap-14">
        <motion.div initial="hidden" animate="show" variants={rise} custom={1} className="text-center">
          <p className="text-[15px] font-medium uppercase tracking-[0.3em] text-ink-400">System</p>
          <div className="mt-8 flex items-center justify-center gap-3">
            {String(sysNo).split('').map((char, i) => (
              <motion.span
                key={`${char}-${i}`}
                initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.25 + i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="hairline flex h-28 min-w-[92px] items-center justify-center rounded-2xl border border-ink-700 bg-ink-900/70 px-5 font-mono text-[56px] font-medium text-ink-050"
              >
                {char}
              </motion.span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={rise}
          custom={2}
          className="flex flex-col items-center gap-6"
        >
          <div className="hairline rounded-3xl border border-ink-700 bg-ink-900/60 p-5">
            <QRCode value={link} size={200} />
          </div>
          <p className="max-w-[420px] text-center text-[15px] leading-relaxed text-ink-400 text-balance">
            Scan with your phone, or open the controller and enter system {sysNo}.
          </p>
        </motion.div>
      </div>

      <motion.footer
        initial="hidden"
        animate="show"
        variants={rise}
        custom={3}
        className="relative flex items-center justify-between"
      >
        <StatusDot status={status} />
        {/* Whether this screen already holds the video is the thing you need to
            know when commissioning a wall, so it is stated plainly. */}
        <span
          className={`text-[11px] font-medium uppercase tracking-[0.16em] ${
            cached ? 'text-live' : 'text-ink-500'
          }`}
        >
          {note || (cached ? 'Video ready' : `Caching ${Math.round(preload * 100)}%`)}
        </span>
      </motion.footer>
    </div>
  )
}

/** A single, very slow radial drift — the only motion on an otherwise still screen. */
function Ambience() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      animate={{ opacity: [0.35, 0.6, 0.35] }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      style={{ background: 'radial-gradient(700px 700px at 50% 42%, rgba(255,255,255,0.055), transparent 70%)' }}
    />
  )
}
