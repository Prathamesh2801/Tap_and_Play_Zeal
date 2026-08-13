/** Minimal inline icon set — no dependency, consistent 1.6px stroke. */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const PlayIcon = (p) => (
  <svg {...base} {...p}>
    <path
      d="M7 4.8v14.4a.8.8 0 0 0 1.22.68l11.5-7.2a.8.8 0 0 0 0-1.36L8.22 4.12A.8.8 0 0 0 7 4.8Z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
)

export const PauseIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
)

export const StopIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
)

export const RestartIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </svg>
)

export const SendIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4.5 12h13M12.5 6.5 18 12l-5.5 5.5" />
  </svg>
)

export const ScreenIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
    <path d="M9 20h6M12 16.5V20" />
  </svg>
)

export const CheckIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12.5 9.5 17 19 7.5" />
  </svg>
)

export const RemoteIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="3" />
    <path d="M12 6.5v.01M12 10.5v.01M12 14.5v.01" />
  </svg>
)
