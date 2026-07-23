import * as React from 'react'
import { cn } from '@/utils/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        // Shares the `field` recipe with Input/Select so every form control
        // focuses, hovers, and disables identically.
        className={cn(
          'field flex min-h-[120px] w-full resize-none rounded-[var(--radius)] px-3.5 py-3 text-sm leading-relaxed',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
