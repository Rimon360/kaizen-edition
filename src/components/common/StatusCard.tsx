import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

type Tone = 'info' | 'danger' | 'success'

const TONE: Record<Tone, { accent: string; tile: string; ring: string }> = {
  info: {
    accent: 'var(--neon-1)',
    tile: 'text-[var(--neon-1)] [--glow:var(--neon-1)]',
    ring: 'border-[var(--neon-1)]/25 bg-[var(--neon-1)]/10',
  },
  danger: {
    accent: 'var(--neon-3)',
    tile: 'text-[var(--neon-3)] [--glow:var(--neon-3)]',
    ring: 'border-[var(--neon-3)]/25 bg-[var(--neon-3)]/10',
  },
  success: {
    accent: 'var(--success)',
    tile: 'text-[var(--success)] [--glow:var(--success)]',
    ring: 'border-[var(--success)]/25 bg-[var(--success)]/10',
  },
}

/**
 * Shared centered status panel for full-screen states (404, access-denied,
 * connection-failed). One glass card, parameterised by icon + tone, with an
 * optional giant ghosted glyph behind it and a scanline overlay so error
 * surfaces still feel like part of the machine.
 */
export function StatusCard({
  icon: Icon,
  tone = 'info',
  title,
  description,
  children,
  ghostGlyph,
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  ghostGlyph?: ReactNode
  className?: string
}) {
  const t = TONE[tone]
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-6">
      {ghostGlyph && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.04]"
        >
          {ghostGlyph}
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn('glass scanline relative w-full max-w-md rounded-[1rem] p-9 text-center', className)}
      >
        <div
          className={cn(
            'glow-sm mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border',
            t.ring,
            t.tile,
          )}
        >
          <Icon className="h-7 w-7" />
        </div>
        <h1
          className="display neon-text text-2xl font-bold"
          style={{ color: t.accent }}
        >
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {children && <div className="mt-7 flex flex-col items-center gap-3">{children}</div>}
      </motion.div>
    </div>
  )
}
