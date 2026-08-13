import { motion } from 'framer-motion'

const VARIANTS = {
  primary:
    'bg-ink-050 text-ink-950 hover:bg-white disabled:bg-ink-500 disabled:text-ink-300',
  secondary:
    'surface hairline text-ink-100 hover:border-ink-500 hover:bg-ink-800 disabled:text-ink-400',
  ghost: 'text-ink-300 hover:text-ink-050 hover:bg-ink-800/70 disabled:text-ink-500',
  danger: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-14 px-7 text-[15px] gap-2.5 rounded-2xl',
  icon: 'h-11 w-11 rounded-xl',
}

export function Button({
  as: Component = motion.button,
  variant = 'secondary',
  size = 'md',
  className = '',
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <Component
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      className={[
        'inline-flex select-none items-center justify-center font-medium tracking-[-0.01em]',
        'transition-colors duration-200 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </Component>
  )
}

export function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden
      className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  )
}
