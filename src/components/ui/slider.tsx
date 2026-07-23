import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/utils/cn'

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[var(--neon-1)] to-[var(--neon-3)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        'glow glow-sm [--glow:var(--neon-1)] [--glow-opacity:0.35]',
        'block h-4 w-4 rounded-full border-2 border-[var(--neon-1)] bg-white',
        'transition-transform duration-150 hover:scale-110',
        'focus-visible:outline-none active:scale-110 active:[--glow-opacity:0.7]',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
