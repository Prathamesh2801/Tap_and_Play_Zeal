import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { DevMockBadge } from './components/DevMockBadge.jsx'
import { Spinner } from './components/ui/Button.jsx'

// Route-level code splitting: the TV device only downloads the screen bundle.
const LandingRoute = lazy(() => import('./routes/LandingRoute.jsx'))
const ScreenRoute = lazy(() => import('./routes/ScreenRoute.jsx'))
const ControllerRoute = lazy(() => import('./routes/ControllerRoute.jsx'))

/**
 * HashRouter is deliberate: the TV and the controller are both opened from
 * pasted links / QR codes on hosts that may not be configured for SPA
 * fallback routing (signage players, static buckets, LAN file servers).
 */
export default function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <AnimatedRoutes />
        </Suspense>
        {/* Renders nothing unless config.devMock.enabled. */}
        <DevMockBadge />
      </ErrorBoundary>
    </HashRouter>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname.split('/')[1] || 'home'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/screen" element={<ScreenRoute />} />
          <Route path="/screen/:sysNo" element={<ScreenRoute />} />
          <Route path="/controller" element={<ControllerRoute />} />
          <Route path="/controller/:sysNo" element={<ControllerRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center text-ink-500">
      <Spinner />
    </div>
  )
}
