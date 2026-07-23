import type { ReactNode } from 'react'
import { FileAudio, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

type Tone = 'success' | 'info' | 'accent'

const TONE: Record<Tone, { wrap: string; chip: string }> = {
  success: {
    wrap: 'border-success/30 bg-success/[0.06]',
    chip: 'bg-success/12 text-success',
  },
  info: {
    wrap: 'border-[var(--neon-1)]/30 bg-[var(--neon-1)]/[0.06]',
    chip: 'bg-[var(--neon-1)]/12 text-[var(--neon-1)]',
  },
  accent: {
    wrap: 'border-[var(--neon-2)]/30 bg-[var(--neon-2)]/[0.06]',
    chip: 'bg-[var(--neon-2)]/12 text-[var(--neon-2)]',
  },
}

/**
 * Shared "attached file" chip — a glowing icon chip, a truncating name (+ optional
 * mono meta), and an optional magenta-on-hover remove button. Replaces the three
 * copy-pasted chip/remove blocks (music, voice-over, saved voices).
 */
export function FilePill({
  icon: Icon = FileAudio,
  name,
  meta,
  onRemove,
  removeLabel = 'Remove',
  tone = 'success',
  className,
}: {
  icon?: LucideIcon
  name: ReactNode
  meta?: ReactNode
  onRemove?: () => void
  removeLabel?: string
  tone?: Tone
  className?: string
}) {
  const t = TONE[tone]
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-[var(--radius)] border px-2.5 py-1.5',
        t.wrap,
        className,
      )}
    >
      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', t.chip)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
        {name}
        {meta != null && <span className="numeric ml-1.5 text-xs text-muted-foreground">{meta}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="no-drag grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--neon-3)]/15 hover:text-[var(--neon-3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--neon-3)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
