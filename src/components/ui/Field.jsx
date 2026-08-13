import { forwardRef } from 'react'

export const Input = forwardRef(function Input({ className = '', invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        'h-12 w-full rounded-xl border bg-ink-900/80 px-4 text-sm text-ink-050',
        'placeholder:text-ink-400 transition-colors duration-200',
        'focus:outline-none focus:ring-0',
        invalid ? 'border-danger/50 focus:border-danger' : 'border-ink-700 focus:border-ink-400',
        className,
      ].join(' ')}
      {...props}
    />
  )
})

export function Label({ children, hint, className = '', ...props }) {
  return (
    <label className={`flex items-baseline justify-between gap-3 ${className}`} {...props}>
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">{children}</span>
      {hint ? <span className="text-[11px] text-ink-500">{hint}</span> : null}
    </label>
  )
}

/** Chunked, uppercase room-code entry. */
export const CodeInput = forwardRef(function CodeInput({ className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      inputMode="text"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      maxLength={8}
      className={[
        'h-16 w-full rounded-2xl border border-ink-700 bg-ink-900/80 text-center',
        'font-mono text-3xl uppercase tracking-[0.4em] text-ink-050 placeholder:tracking-[0.4em]',
        'placeholder:text-ink-600 transition-colors duration-200 focus:border-ink-400 focus:outline-none',
        className,
      ].join(' ')}
      {...props}
    />
  )
})
