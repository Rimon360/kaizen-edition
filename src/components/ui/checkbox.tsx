import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer relative h-[18px] w-[18px] shrink-0 rounded-[6px] border border-input bg-black/30 transition-colors hover:border-[var(--neon-1)]/50 disabled:cursor-not-allowed disabled:opacity-50',
      'focus:outline-none focus-visible:border-[var(--neon-1)] focus-visible:[--glow-opacity:0.35] focus-visible:[--glow:var(--neon-1)] focus-visible:glow focus-visible:glow-sm',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:[--glow-opacity:0.4] data-[state=checked]:[--glow:var(--neon-1)] data-[state=checked]:glow data-[state=checked]:glow-sm',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn(
        'flex items-center justify-center text-current animate-in zoom-in-95 fade-in-0 duration-150',
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
