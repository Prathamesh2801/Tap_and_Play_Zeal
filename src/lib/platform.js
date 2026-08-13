const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const isIOS =
  /iP(hone|ad|od)/.test(ua) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isSafari = /^((?!chrome|crios|fxios|edg|android).)*safari/i.test(ua)

/**
 * WebKit needs different media handling from Blink/Gecko:
 *
 *  - it drives <video> through a range-request pipeline, and a `blob:` source
 *    bypasses that, which shows up as stalling and dropped frames rather than a
 *    clean failure
 *  - `playbackRate` writes are comparatively expensive, so drift correction has
 *    to touch it less often
 */
export const isWebKitMedia = isIOS || isSafari
