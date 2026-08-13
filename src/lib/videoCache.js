/**
 * Preload media to a blob before it is ever played.
 *
 * `<video preload="auto">` is a hint, not a guarantee — browsers throttle it,
 * and a seek can still stall on a range request. Fetching the whole file first
 * and handing the element a blob: URL removes the network from playback
 * entirely: seeking and looping become memory operations, which is what stops a
 * screen stuttering part way through a loop.
 *
 * Two caches, and it matters which is doing the work:
 *
 *  - the in-memory map below always applies, and is what guarantees playback
 *    never touches the network once the file has arrived
 *  - Cache Storage would let it survive a reload, but it requires a SECURE
 *    CONTEXT. Served over plain http:// on a LAN address it is simply absent,
 *    so on this deployment it does nothing and the HTTP cache is what makes a
 *    reload cheap. That is why `fetch` asks for `force-cache`, and why the
 *    server should send a long `Cache-Control` on the video.
 */

const CACHE_NAME = 'tapplay-media-v1'

const memory = new Map() // url -> { objectUrl, bytes }
const inflight = new Map()

/** True only in a secure context; false over plain http:// on a LAN address. */
export const persistentCacheAvailable = typeof window !== 'undefined' && 'caches' in window

async function fromCacheStorage(url) {
  if (!persistentCacheAvailable) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

async function toCacheStorage(url, response) {
  if (!persistentCacheAvailable) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, response)
  } catch {
    // Quota or opaque response — the in-memory copy still does the real work.
  }
}

/**
 * @param {string} url
 * @param {(progress: {loaded: number, total: number, ratio: number}) => void} [onProgress]
 * @returns {Promise<string>} an object URL backed by the fully downloaded file
 */
export function preloadMedia(url, onProgress) {
  if (memory.has(url)) return Promise.resolve(memory.get(url).objectUrl)
  if (inflight.has(url)) return inflight.get(url)

  const task = (async () => {
    let blob = await fromCacheStorage(url)

    if (!blob) {
      const response = await fetch(url, { cache: 'force-cache' })
      if (!response.ok) throw new Error(`Could not fetch media (${response.status})`)

      await toCacheStorage(url, response.clone())

      const total = Number(response.headers.get('Content-Length')) || 0
      if (response.body && total && onProgress) {
        const reader = response.body.getReader()
        const chunks = []
        let loaded = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.length
          onProgress({ loaded, total, ratio: loaded / total })
        }
        blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'video/mp4' })
      } else {
        blob = await response.blob()
      }
    }

    onProgress?.({ loaded: blob.size, total: blob.size, ratio: 1 })

    const objectUrl = URL.createObjectURL(blob)
    memory.set(url, { objectUrl, bytes: blob.size })
    inflight.delete(url)
    return objectUrl
  })()

  inflight.set(url, task)
  task.catch(() => inflight.delete(url))
  return task
}

export function cachedBytes(url) {
  return memory.get(url)?.bytes ?? 0
}

/** True once the whole file is held in memory and playback cannot touch the network. */
export function isCached(url) {
  return memory.has(url)
}
