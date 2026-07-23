import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'relative inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/45 bg-primary/15 text-primary',
        accent: 'border-accent/45 bg-accent/15 text-accent',
        success: 'border-success/45 bg-success/15 text-success',
        warning: 'border-warning/45 bg-warning/15 text-warning',
        destructive: 'border-destructive/45 bg-destructive/15 text-destructive',
        muted: 'border-white/15 bg-white/5 text-muted-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

// per-variant glow color drives both the halo and the dot
const glowColor: Record<string, string> = {
  default: 'var(--neon-1)',
  accent: 'var(--neon-3)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  muted: 'var(--muted-foreground)',
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Adds a subtle color-matched halo + text glow. */
  glow?: boolean
  /** Renders a leading status dot; `'pulse'` makes it breathe for live/processing states. */
  dot?: boolean | 'pulse'
}

function Badge({ className, variant, size, glow, dot, children, ...props }: BadgeProps) {
  const color = glowColor[variant ?? 'default']
  return (
    <div
      className={cn(
        badgeVariants({ variant, size }),
        glow && 'glow glow-sm neon-text',
        className,
      )}
      style={glow ? ({ '--glow': color, '--glow-opacity': 0.25 } as React.CSSProperties) : undefined}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            'inline-block size-1.5 shrink-0 rounded-full',
            dot === 'pulse' && 'animate-pulse-glow',
          )}
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
