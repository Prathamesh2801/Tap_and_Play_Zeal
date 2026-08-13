import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A file watcher error should never kill the dev server.
 *
 * On Windows, `fs.watch` throws EBUSY for any file another process holds open —
 * a video still being copied, a zip mid-write, an antivirus scan. Chokidar
 * emits that on the watcher, and with no listener attached Node treats it as an
 * unhandled error and takes the whole process down. Attaching a listener is
 * what makes it non-fatal; watching is best-effort by nature, so logging and
 * carrying on is the correct response to every error it can raise.
 */
const tolerateWatcherErrors = () => ({
  name: 'tolerate-watcher-errors',
  apply: 'serve',
  configureServer(server) {
    server.watcher.on('error', (error) => {
      console.warn(`[watch] ignored ${error?.code || 'error'}: ${error?.path || error?.message}`)
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), tolerateWatcherErrors()],

  // Relative asset URLs, so a build can be dropped into any subdirectory of the
  // Apache host (e.g. /test/Tap&Play/app/) without rewriting paths. HashRouter
  // means routing needs no server config either.
  base: './',

  server: {
    // Exposed on the LAN so a phone can act as the controller against the dev
    // build. The PHP host sends `Access-Control-Allow-Origin: *`, so the app
    // talks to it directly — no proxy needed.
    host: true,
    watch: {
      // Nothing here is a source input, and all of it is prone to being locked
      // mid-write. Keeping it out of the watcher avoids the churn entirely.
      ignored: [
        '**/dist/**',
        '**/*.{zip,7z,rar,tar,gz}',
        '**/*.{mp4,webm,mov,m4v,mkv,avi,ogv}',
        '**/src/assets/media/**',
        '**/public/media/**',
      ],
    },
  },
})
