import { config } from './config.js'

/**
 * SYS_NO — the single identifier that binds a controller to a screen.
 *
 * It is captured once at startup, persisted, and thereafter carried in the URL
 * so a screen is always addressable and shareable by link/QR.
 */

const STORAGE_KEY = 'tapplay.sysNo'

/** Digits only — the backend keys on a plain integer. */
export function normalizeSysNo(value) {
  return String(value ?? '')
    .replace(/[^0-9]/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 6)
}

export function isValidSysNoFormat(value) {
  return normalizeSysNo(value).length > 0
}

export function storeSysNo(value) {
  const sysNo = normalizeSysNo(value)
  if (!sysNo) return
  try {
    localStorage.setItem(STORAGE_KEY, sysNo)
  } catch {
    // Private mode: the session still works, it just won't be remembered.
  }
}

export function readSysNo() {
  try {
    return normalizeSysNo(localStorage.getItem(STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

export function forgetSysNo() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing to do
  }
}

/** Origin used when building shareable links (the pairing QR). */
export function appOrigin() {
  if (config.publicOrigin) return config.publicOrigin
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '')
}

export const controllerUrl = (sysNo) => `${appOrigin()}#/controller/${normalizeSysNo(sysNo)}`
export const screenUrl = (sysNo) => `${appOrigin()}#/screen/${normalizeSysNo(sysNo)}`
