import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '@/utils/cn'

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, type = 'scroll', ...props }, ref) => (
  // `type="scroll"`: the bar appears only while actively scrolling, then fades —
  // it never pops in just because the pointer is over the panel.
  <ScrollAreaPrimitive.Root
    ref={ref}
    type={type}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      className="flex h-full w-2.5 touch-none select-none p-0.5 opacity-0 transition-opacity duration-200 data-[state=visible]:opacity-100"
    >
      <ScrollAreaPrimitive.Thumb className="glow glow-sm [--glow:var(--neon-1)] [--glow-opacity:0.35] relative flex-1 rounded-full bg-gradient-to-b from-[var(--neon-1)]/60 to-[var(--neon-2)]/50 transition-colors hover:from-[var(--neon-1)]/80 hover:to-[var(--neon-2)]/70" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Scrollbar
      orientation="horizontal"
      className="flex h-2.5 w-full touch-none select-none flex-col p-0.5 opacity-0 transition-opacity duration-200 data-[state=visible]:opacity-100"
    >
      <ScrollAreaPrimitive.Thumb className="glow glow-sm [--glow:var(--neon-1)] [--glow-opacity:0.35] relative flex-1 rounded-full bg-gradient-to-r from-[var(--neon-1)]/60 to-[var(--neon-2)]/50 transition-colors hover:from-[var(--neon-1)]/80 hover:to-[var(--neon-2)]/70" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner className="bg-transparent" />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

export { ScrollArea }
