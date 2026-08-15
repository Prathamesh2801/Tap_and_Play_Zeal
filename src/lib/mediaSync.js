/**
 * The clock-driven positioning maths, in one place.
 *
 * Two surfaces now play the same timeline: the screens show the video, and the
 * controller (a laptop wired to the room's speakers) plays the matching audio.
 * They are different elements on different machines and they must agree to
 * within a few tens of milliseconds, or the sound lands off the picture.
 *
 * Nothing here touches the network or the DOM beyond one element, and nothing
 * here knows whether it is driving a <video> or an <audio>. That is the point:
 * if the drift policy lived in two components it would eventually be two
 * policies, and the failure would show up as lip-sync slowly rotting on a wall
 * nobody is standing next to.
 */

import { config } from './config.js'
import { isWebKitMedia } from './platform.js'

/**
 * Where the loop should be at `instant`.
 *
 * An anchor in the future returns 0 — the element holds its first frame until
 * the scheduled moment arrives, which is what makes Restart land together.
 */
export function positionAt(instant, anchor, duration) {
  if (!duration) return 0
  const elapsed = (instant - anchor) / 1000
  return elapsed <= 0 ? 0 : elapsed % duration
}

/**
 * How far `currentTime` is from where it should be, taking the short way round.
 * Near the loop seam the quicker correction is often across the boundary rather
 * than all the way back through the middle.
 */
export function driftFrom(currentTime, position, duration) {
  let drift = currentTime - position
  if (drift > duration / 2) drift -= duration
  else if (drift < -duration / 2) drift += duration
  return drift
}

/** Correction constants for this platform. WebKit corrects less often. */
export function tuningFor() {
  const base = config.sync
  const webkit = isWebKitMedia ? base.webkit : null
  return {
    tick: webkit?.correctionMs ?? base.correctionMs,
    soft: webkit?.softDrift ?? base.softDrift,
    hardSeek: base.hardSeek,
    maxRate: webkit?.maxRateAdjust ?? base.maxRateAdjust,
  }
}

/** The rate ceiling, tightened while anything is actually audible. */
export function rateCapFor(maxRate, audible) {
  return audible ? Math.min(maxRate, config.sync.audioMaxRateAdjust) : maxRate
}

/**
 * Move `el` toward `position`, and report the drift that was seen.
 *
 * Three regimes, and the boundaries matter:
 *   beyond `hardSeek`  — too far to slide; snap, and accept the visible jump
 *   beyond `soft`      — slide by trimming playbackRate, invisible
 *   within `soft`      — leave it alone, and make sure the rate is back at 1
 *
 * `playbackRate` is only written when the value actually needs to move: on
 * WebKit a rate write can cost a frame, which is the exact jank being chased.
 */
export function correctTo(el, position, duration, { soft, hardSeek, maxRate }) {
  const drift = driftFrom(el.currentTime, position, duration)

  const setRate = (rate) => {
    if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate
  }

  if (Math.abs(drift) > hardSeek) {
    el.currentTime = position
    setRate(1)
  } else if (Math.abs(drift) > soft) {
    setRate(1 + Math.max(-maxRate, Math.min(maxRate, -drift)))
  } else {
    setRate(1)
  }

  return drift
}
