import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button.jsx'
import { RemoteIcon, ScreenIcon } from '../components/ui/Icons.jsx'
import { readSysNo } from '../lib/system.js'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } } }
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] } },
}

export default function LandingRoute() {
  const navigate = useNavigate()
  const sysNo = readSysNo()

  const go = (surface) => navigate(sysNo ? `/${surface}/${sysNo}` : `/${surface}`)

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(900px 600px at 50% 0%, rgba(255,255,255,0.05), transparent 65%)' }}
      />

      <motion.div variants={stagger} initial="hidden" animate="show" className="relative w-full max-w-lg">
        <motion.p variants={item} className="text-[11px] font-medium uppercase tracking-[0.42em] text-ink-500">
          Tap &amp; Play
        </motion.p>

        <motion.h1
          variants={item}
          className="mt-5 text-[40px] font-medium leading-[1.08] tracking-[-0.03em] text-ink-050 text-balance"
        >
          Push any video to any screen, instantly.
        </motion.h1>

        <motion.p variants={item} className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-400">
          Screens and controllers pair by system number. Paste a link on your phone and the screen
          updates in real time over a live server stream — no refresh, no cables.
        </motion.p>

        <motion.div variants={item} className="mt-9 grid gap-3 sm:grid-cols-2">
          <Button variant="primary" size="lg" onClick={() => go('screen')} className="justify-between">
            Open a screen
            <ScreenIcon width={18} height={18} />
          </Button>
          <Button size="lg" onClick={() => go('controller')} className="justify-between">
            Open the controller
            <RemoteIcon width={18} height={18} />
          </Button>
        </motion.div>

        {sysNo && (
          <motion.p variants={item} className="mt-5 font-mono text-[12px] tracking-[0.16em] text-ink-500">
            SYSTEM · {sysNo}
          </motion.p>
        )}
      </motion.div>
    </main>
  )
}
