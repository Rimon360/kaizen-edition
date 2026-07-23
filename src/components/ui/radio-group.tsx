import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import { cn } from '@/utils/cn'

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'relative aspect-square h-[18px] w-[18px] shrink-0 rounded-full border border-input bg-black/30 text-primary transition-colors hover:border-[var(--neon-1)]/50 disabled:cursor-not-allowed disabled:opacity-50',
      'focus:outline-none focus-visible:border-[var(--neon-1)] focus-visible:[--glow-opacity:0.35] focus-visible:[--glow:var(--neon-1)] focus-visible:glow focus-visible:glow-sm',
      'data-[state=checked]:border-primary data-[state=checked]:[--glow-opacity:0.4] data-[state=checked]:[--glow:var(--neon-1)] data-[state=checked]:glow data-[state=checked]:glow-sm',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center animate-in zoom-in-95 fade-in-0 duration-150">
      <Circle className="h-2 w-2 fill-primary text-primary" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
