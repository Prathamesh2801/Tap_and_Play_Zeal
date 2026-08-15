/**
 * A real stand-in for sse.php + data.php. Node, no dependencies.
 *
 *   npm run mock          # listens on 0.0.0.0:4000
 *
 * ── Why this exists alongside the in-browser mock ──────────────────────
 * `config.devMock.enabled` fakes the backend inside the page using
 * BroadcastChannel + localStorage. Both of those are scoped to ONE browser
 * profile on ONE origin, so that mock can only ever join tabs of the same
 * browser. It cannot join Chrome to Edge, and it cannot join two machines —
 * which makes it useless for the thing this project is actually for: ten
 * separate screens on a LAN.
 *
 * This server has no such limit. It speaks the wire contract over HTTP, so
 * every device on the router talks to it exactly as they will talk to the PHP:
 * a genuine EventSource, genuine POSTs, genuine cross-device timing.
 *
 * ── Using it ───────────────────────────────────────────────────────────
 * In src/lib/config.js:
 *     devMock.enabled = false
 *     apiBaseUrl      = "http://<this-machine-lan-ip>:4000"
 *
 * Use the LAN IP, not localhost, or other devices cannot reach it.
 *
 * ── Fidelity ───────────────────────────────────────────────────────────
 * Pushes are staggered per connection by a fixed random lag (see LAG), the way
 * each real screen sits at its own point in the PHP's poll cycle. This is
 * deliberate: if every screen were told at the same instant they would look
 * synced even with the anchor maths broken, and the test would prove nothing.
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 4000)
const SYSTEMS = (process.env.MOCK_SYSTEMS || '1,2,3,4,5,6,7,8,9,10').split(',')
const LAG = [Number(process.env.MOCK_LAG_MIN || 600), Number(process.env.MOCK_LAG_MAX || 1100)]
const HEARTBEAT_MS = 15000

/** sysNo -> { PlayStatus, Play } */
const state = new Map()
/** sysNo -> Set<{ res, lag }> */
const clients = new Map()

const known = (sysNo) => SYSTEMS.includes(String(sysNo))
const between = ([min, max]) => min + Math.random() * (max - min)

function frameFor(sysNo) {
  if (!known(sysNo)) return { Status: false, Message: 'Invalid System Number.' }
  const row = state.get(String(sysNo)) || {}
  return {
    Status: true,
    Message: 'System Found',
    SYS_NO: String(sysNo),
    PlayStatus: row.PlayStatus || 'Pause',
    Play: row.Play || '',
  }
}

function push(sysNo) {
  const frame = `data: ${JSON.stringify(frameFor(sysNo))}\n\n`
  for (const client of clients.get(String(sysNo)) || []) {
    setTimeout(() => {
      try {
        client.res.write(frame)
      } catch {
        // Client vanished mid-write; the 'close' handler does the cleanup.
      }
    }, client.lag)
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(res, payload, status = 200) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

/**
 * Minimal multipart/form-data reader — enough for the two short text fields
 * data.php takes. Bringing in a parser library for this would be silly.
 */
function parseMultipart(buffer, boundary) {
  const fields = {}
  for (const part of buffer.toString('binary').split(`--${boundary}`)) {
    const split = part.indexOf('\r\n\r\n')
    if (split === -1) continue
    const name = /name="([^"]*)"/.exec(part.slice(0, split))?.[1]
    if (!name) continue
    fields[name] = Buffer.from(part.slice(split + 4).replace(/\r\n$/, ''), 'binary').toString('utf8')
  }
  return fields
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const sysNo = url.searchParams.get('SYS_NO') || ''

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }

  // ── sse.php ──────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/sse.php')) {
    res.writeHead(200, {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Without this, a reverse proxy in front of the real deployment would
      // sit on the stream. Harmless here, correct to keep in the contract.
      'X-Accel-Buffering': 'no',
    })

    const client = { res, lag: between(LAG) }
    const key = String(sysNo)
    if (!clients.has(key)) clients.set(key, new Set())
    clients.get(key).add(client)

    res.write(`data: ${JSON.stringify(frameFor(sysNo))}\n\n`)

    // Comment lines, exactly as sse.php sends them: the EventSource parser
    // consumes these without ever surfacing them to JavaScript.
    const beat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        /* closing */
      }
    }, HEARTBEAT_MS)

    req.on('close', () => {
      clearInterval(beat)
      clients.get(key)?.delete(client)
    })

    console.log(`[sse]   SYS_NO=${sysNo} connected (lag ${Math.round(client.lag)}ms, ${clients.get(key).size} on this system)`)
    return undefined
  }

  // ── data.php ─────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/data.php')) {
    if (req.method !== 'POST') return json(res, { Status: false, Message: 'Method not allowed.' }, 405)

    const raw = await readBody(req)
    const type = req.headers['content-type'] || ''
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type)
    const fields = boundary
      ? parseMultipart(raw, boundary[1] || boundary[2])
      : Object.fromEntries(new URLSearchParams(raw.toString('utf8')))

    // The real endpoint rejects partial writes, which is why the client
    // re-sends the URL on every pause. Keep that behaviour honest.
    if (fields.Status == null || fields.Play == null) {
      return json(res, { Status: false, Message: 'Data are missing.' })
    }
    if (!known(sysNo)) return json(res, { Status: false, Message: 'Invalid System Number.' })

    state.set(String(sysNo), { PlayStatus: fields.Status, Play: fields.Play })
    console.log(`[write] SYS_NO=${sysNo} ${fields.Status} ${fields.Play || '(cleared)'}`)
    push(sysNo)

    return json(res, { Status: true, Message: 'Play Updated' })
  }

  return json(res, { Status: false, Message: 'Not found.' }, 404)
})

/**
 * Without this, a second `npm run mock` dies on an unhandled 'error' event and
 * prints a Node stack trace, which says nothing about the actual situation:
 * there is almost always already a mock running in another terminal.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already taken — a mock server is probably already running.\n`)
    console.error(`  Check:  netstat -ano | findstr :${PORT}`)
    console.error(`  Stop:   taskkill /PID <pid> /F`)
    console.error(`  Or use another port:  MOCK_PORT=4001 npm run mock`)
    console.error(`  (then match it in config.apiBaseUrl)\n`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  mock backend  →  http://localhost:${PORT}`)
  console.log(`  systems       →  ${SYSTEMS.join(', ')}`)
  console.log(`  delivery lag  →  ${LAG[0]}–${LAG[1]}ms per connection\n`)
  console.log(`  Point config.apiBaseUrl at this host's LAN IP and set devMock.enabled = false.\n`)
})
