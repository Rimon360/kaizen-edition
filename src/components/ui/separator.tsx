import * as React from 'react'
import { cn } from '@/utils/cn'

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  /** Purely visual dividers stay out of the a11y tree. */
  decorative?: boolean
}

// A fading neon hairline rather than a flat gray rule — transparent at the ends,
// a whisper of cyan in the middle, so the divider reads as part of the HUD.
const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0',
        orientation === 'horizontal'
          ? 'h-px w-full bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--neon-1)_28%,transparent),transparent)]'
          : 'h-full w-px bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--neon-1)_28%,transparent),transparent)]',
        className,
      )}
      {...props}
    />
  ),
)
Separator.displayName = 'Separator'

export { Separator }
