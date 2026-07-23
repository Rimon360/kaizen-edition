import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  // Hover ALWAYS brightens + lifts (never dims — a dimming hover reads as "disabled").
  // Enabled = pointer cursor; disabled = clearly washed-out (faded + desaturated) and
  // inert, so active / hover / disabled are three unmistakable states.
  // CYBERPUNK: every variant glows via a neon BORDER + a blurred neon halo on the
  // ::after layer (NO box-shadow). Keyboard focus uses the global cyan outline.
  'relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-medium cursor-pointer transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 disabled:after:opacity-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] no-drag after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:blur-md after:transition-opacity after:duration-150',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary/50 enabled:hover:brightness-110 after:bg-primary after:opacity-45 enabled:hover:after:opacity-75',
        gradient:
          'bg-gradient-to-r from-primary to-accent text-white border border-white/15 enabled:hover:brightness-110 after:bg-[linear-gradient(to_right,var(--neon-1),var(--neon-3))] after:opacity-55 enabled:hover:after:opacity-85',
        secondary:
          'bg-white/[0.05] text-secondary-foreground border border-[var(--neon-1)]/30 backdrop-blur-sm enabled:hover:bg-white/[0.09] enabled:hover:border-[var(--neon-1)]/60 enabled:hover:text-foreground after:bg-[var(--neon-1)] after:opacity-0 enabled:hover:after:opacity-30',
        ghost: 'text-foreground/75 enabled:hover:bg-white/10 enabled:hover:text-foreground after:hidden',
        outline:
          'border border-[var(--neon-1)]/25 bg-white/[0.02] text-foreground/90 backdrop-blur-sm enabled:hover:bg-white/[0.06] enabled:hover:border-[var(--neon-1)]/55 enabled:hover:text-foreground after:bg-[var(--neon-1)] after:opacity-0 enabled:hover:after:opacity-25',
        destructive:
          'bg-destructive text-destructive-foreground border border-destructive/50 enabled:hover:brightness-110 after:bg-destructive after:opacity-40 enabled:hover:after:opacity-70',
        success:
          'bg-success text-[#04140d] border border-success/50 enabled:hover:brightness-110 after:bg-success after:opacity-40 enabled:hover:after:opacity-70',
        link: 'text-primary underline-offset-4 enabled:hover:underline enabled:hover:brightness-110 after:hidden',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        // Icon buttons match their text-button counterparts to the pixel so
        // mixed toolbars align: icon↔default (40px), icon-sm↔sm (32px).
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
