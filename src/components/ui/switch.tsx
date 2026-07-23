import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '@/utils/cn'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      'focus:outline-none focus-visible:border-[var(--neon-1)] focus-visible:[--glow-opacity:0.35] focus-visible:[--glow:var(--neon-1)] focus-visible:glow focus-visible:glow-sm',
      'data-[state=checked]:border-[var(--neon-1)]/60 data-[state=checked]:bg-[linear-gradient(90deg,var(--neon-1),var(--neon-2))] data-[state=checked]:[--glow-opacity:0.45] data-[state=checked]:[--glow:var(--neon-1)] data-[state=checked]:glow data-[state=checked]:glow-sm',
      'data-[state=unchecked]:border-white/15 data-[state=unchecked]:bg-white/10',
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-white transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
