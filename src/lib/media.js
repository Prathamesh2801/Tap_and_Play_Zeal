/**
 * Media resolution — turn an arbitrary URL into something the stage can render.
 *
 * Adding a new provider means adding one entry to RESOLVERS; the stage component
 * switches on `kind` and never learns about URL formats.
 */

import { bundledVideo } from './config.js'

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i
const YT_SHORTS = /youtube\.com\/shorts\//i
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/i
const FILE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i
const HLS = /\.m3u8(\?|#|$)/i
const DASH = /\.mpd(\?|#|$)/i
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i

const RESOLVERS = [
  {
    kind: 'youtube',
    label: 'YouTube',
    match: (u) => YT.exec(u)?.[1],
    /**
     * Every parameter here is doing a job:
     *   autoplay + mute      the only combination browsers start unattended
     *   controls=0           no scrubber, no play button
     *   disablekb, fs=0      no keyboard control, no fullscreen affordance
     *   modestbranding,
     *   rel, iv_load_policy,
     *   cc_load_policy       suppress logo, related videos, annotations, captions
     *   enablejsapi          lets the screen drive the player over postMessage
     *
     * Note what is NOT here: `loop=1&playlist=<id>`. That is YouTube's documented
     * way to loop an embed, but turning the video into a playlist makes the
     * player draw previous/next buttons over it. Looping is done from the JS API
     * instead (see EmbedStage) so the player stays completely bare.
     */
    build: (id, url) => ({
      embedUrl:
        `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0` +
        `&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&enablejsapi=1`,
      origin: 'https://www.youtube.com',
      isShort: YT_SHORTS.test(url),
      id,
      url,
    }),
  },
  {
    kind: 'vimeo',
    label: 'Vimeo',
    match: (u) => VIMEO.exec(u)?.[1],
    build: (id, url) => ({
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0&controls=0`,
      origin: 'https://player.vimeo.com',
      id,
      url,
    }),
  },
  { kind: 'hls', label: 'HLS stream', match: (u) => HLS.test(u), build: (_, url) => ({ src: url, url }) },
  { kind: 'dash', label: 'DASH stream', match: (u) => DASH.test(u), build: (_, url) => ({ src: url, url }) },
  { kind: 'image', label: 'Image', match: (u) => IMAGE.test(u), build: (_, url) => ({ src: url, url }) },
  { kind: 'video', label: 'Video file', match: (u) => FILE.test(u), build: (_, url) => ({ src: url, url }) },
]

/**
 * Sync state rides in the media URL, because data.php stores no other free-text
 * field — an extra form field is silently dropped. Two values:
 *
 *   t = anchor        the instant the loop is measured from
 *   p = paused-at     the instant playback was frozen
 *
 * `t` is a reading on the shared clock, not necessarily a wall-clock date:
 * resuming shifts it forward by however long the pause lasted, which is what
 * makes the video continue from the frame it stopped on instead of wherever the
 * clock has since wandered to. Position only ever depends on the difference, so
 * any consistent value works.
 */
export function parseSync(rawUrl) {
  const raw = String(rawUrl || '')
  const t = /[?&]t=(\d+)/.exec(raw)
  const p = /[?&]p=(\d+)/.exec(raw)
  return { anchor: t ? Number(t[1]) : 0, pausedAt: p ? Number(p[1]) : 0 }
}

export function withSync(url, { anchor = 0, pausedAt = 0 } = {}) {
  const base = stripSync(url)
  const parts = []
  if (anchor > 0) parts.push(`t=${Math.round(anchor)}`)
  if (pausedAt > 0) parts.push(`p=${Math.round(pausedAt)}`)
  if (!parts.length) return base
  return `${base}${base.includes('?') ? '&' : '?'}${parts.join('&')}`
}

/**
 * The media's identity, ignoring sync state. Keying UI on this stops a restart
 * or a pause — which only change `?t=`/`?p=` — from tearing the player down and
 * rebuilding it, which would black the screen out and reload the video.
 */
export function mediaKey(url) {
  return stripSync(url)
}

/**
 * Remove the sync params, leaving the media's stable identity.
 *
 * Done by splitting the query rather than by regex replacement: a global
 * replace consumes the `&` that separates two adjacent params, so the one after
 * it no longer has a leading separator to match and survives. `?t=1&p=2` came
 * out as `?p=2`, which changed the media key on every pause and remounted the
 * player — a black frame and a reload instead of a pause.
 */
function stripSync(url) {
  const raw = String(url || '')
  const split = raw.indexOf('?')
  if (split === -1) return raw

  const base = raw.slice(0, split)
  const kept = raw
    .slice(split + 1)
    .split('&')
    .filter((pair) => pair && !/^[tp]=\d+$/.test(pair))

  return kept.length ? `${base}?${kept.join('&')}` : base
}

/** `local:<key>` resolves to a video bundled into the build (see config.bundledVideos). */
function resolveLocal(url) {
  const entry = bundledVideo(url)
  if (!entry) return null
  return { kind: 'video', label: 'Bundled video', src: entry.src, title: entry.title, url, local: true }
}

/** The library key a URL refers to, or '' if it is not a bundled video. */
export function bundledKey(url) {
  const raw = String(url || '').trim()
  if (!raw.startsWith('local:')) return ''
  return bundledVideo(raw)?.key || ''
}

/** @returns {{kind:string,label:string,src?:string,embedUrl?:string,url:string}} */
export function resolveMedia(rawUrl) {
  const raw = String(rawUrl || '').trim()
  if (!raw) return { kind: 'none', label: 'Nothing', url: '' }

  if (raw.startsWith('local:')) {
    return resolveLocal(raw) || { kind: 'none', label: 'Missing bundled video', url: raw }
  }

  const url = stripSync(raw)

  for (const r of RESOLVERS) {
    const hit = r.match(url)
    if (hit) return { kind: r.kind, label: r.label, ...r.build(hit, url) }
  }
  // Unknown extension: assume a direct video stream and let <video> decide.
  return { kind: 'video', label: 'Stream', src: url, url }
}

export function isPlayableUrl(value) {
  const url = String(value || '').trim()
  if (!url) return false
  if (url.startsWith('local:')) return Boolean(resolveLocal(url))
  try {
    const parsed = new URL(stripSync(url))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Best-effort human label for a URL. The backend carries no title field, so the
 * filename is the most meaningful thing available.
 */
export function displayTitle(url) {
  if (!url) return ''
  if (String(url).startsWith('local:')) {
    const entry = bundledVideo(url)
    return entry ? entry.title : String(url).slice('local:'.length).split('?')[0]
  }
  try {
    const { pathname, hostname } = new URL(url)
    const last = pathname.split('/').filter(Boolean).pop()
    return decodeURIComponent(last || hostname)
  } catch {
    return String(url)
  }
}
