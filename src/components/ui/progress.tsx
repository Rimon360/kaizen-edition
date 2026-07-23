import * as React from 'react'
import { cn } from '@/utils/cn'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indeterminate?: boolean
}

const TRIAD = 'bg-[linear-gradient(90deg,var(--neon-1),var(--neon-2),var(--neon-3))]'

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indeterminate, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, value))
    // percent 0 (or explicit flag) reads as indeterminate so the bar never looks stalled
    const isIndeterminate = indeterminate || pct === 0

    return (
      <div
        ref={ref}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-white/10', className)}
        {...props}
      >
        {isIndeterminate ? (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div
              className={cn(
                'absolute inset-y-0 w-1/3 rounded-full opacity-90 animate-shimmer',
                'bg-[linear-gradient(90deg,transparent,var(--neon-1),var(--neon-3),transparent)]',
              )}
            />
          </div>
        ) : (
          <div
            className={cn('relative h-full rounded-full transition-[width] duration-300 ease-out', TRIAD)}
            style={{ width: `${pct}%` }}
          >
            {/* soft leading-edge glow cap */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-[-2px] right-[-4px] w-2 rounded-full bg-[var(--neon-3)] opacity-70 blur-[3px]"
            />
            {/* moving sheen highlight */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
            >
              <span className="absolute inset-y-0 w-1/3 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]" />
            </span>
          </div>
        )}
      </div>
    )
  },
)
Progress.displayName = 'Progress'

export { Progress }
