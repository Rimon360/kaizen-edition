import { cn } from '@/utils/cn'

interface ColorInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  /** Accessible name for the color picker (e.g. "Text color"). */
  label?: string
}

export function ColorInput({ value, onChange, className, disabled, label }: ColorInputProps) {
  return (
    <label
      className={cn(
        'field relative flex h-9 cursor-pointer items-center gap-2 px-2 hover:border-[var(--neon-1)]/50',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-full border border-[var(--neon-1)]/30"
        style={{ backgroundColor: value }}
      />
      <span aria-hidden className="numeric text-xs uppercase text-muted-foreground">
        {value}
      </span>
      <input
        type="color"
        aria-label={label ?? 'Color'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}
