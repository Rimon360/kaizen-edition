import { cn } from '@/utils/cn'

interface SectionHeadingProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  className?: string
  align?: 'center' | 'left'
}

export function SectionHeading({
  title,
  subtitle,
  icon,
  className,
  align = 'center',
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="text-primary">{icon}</span>
        ) : (
          <span
            aria-hidden
            className="h-4 w-[3px] shrink-0 rounded-full bg-[var(--neon-1)] glow glow-sm [--glow:var(--neon-1)]"
          />
        )}
        <h2 className="neon-text display text-xl font-bold tracking-tight [text-shadow:0_0_18px_color-mix(in_oklab,var(--neon-1)_30%,transparent)]">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="display text-[11px] uppercase tracking-[0.16em] text-foreground/55">
          {subtitle}
        </p>
      )}
    </div>
  )
}

/** Small uppercase label used to group fields within a panel. */
export function FieldGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}
