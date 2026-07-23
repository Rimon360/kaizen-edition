import * as React from 'react'
import { cn } from '@/utils/cn'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      // `field` (index.css) carries the whole neon-field recipe: translucent
      // inset surface, cyan edge, focus border + focus-only drop-shadow glow
      // (no box-shadow), and the desaturated disabled state.
      className={cn(
        'field flex h-10 w-full rounded-[var(--radius)] px-3.5 py-2 text-sm',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
