import { Clapperboard } from 'lucide-react'
import { cn } from '@/utils/cn'

type Size = 'sm' | 'md' | 'lg'

const TILE: Record<Size, string> = {
  sm: 'h-6 w-6 rounded-md',
  md: 'h-11 w-11 rounded-xl',
  lg: 'h-16 w-16 rounded-2xl',
}
const ICON: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}
const GLOW: Record<Size, string> = {
  sm: '[--glow-opacity:0.55]',
  md: '[--glow-opacity:0.6]',
  lg: '[--glow-opacity:0.6]',
}
const WORD: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-2xl',
  lg: 'text-lg',
}

/**
 * The one true KAIZEN EDITION logo glyph. Previously hand-rolled in three places
 * with three drifting radii; this keeps the gradient tile + neon halo identical
 * (scaled) everywhere. Pass `withWordmark` to append the wordmark.
 */
export function BrandMark({
  size = 'md',
  withWordmark = false,
  className,
}: {
  size?: Size
  withWordmark?: boolean
  className?: string
}) {
  const glyph = (
    <div
      aria-hidden
      className={cn(
        'glow grid shrink-0 place-items-center bg-gradient-to-br from-primary to-accent [--glow:linear-gradient(135deg,var(--neon-1),var(--neon-3))]',
        TILE[size],
        GLOW[size],
      )}
    >
      <Clapperboard className={cn('text-white', ICON[size])} />
    </div>
  )

  if (!withWordmark) return <span className={className}>{glyph}</span>

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      {glyph}
      <span className={cn('display font-semibold tracking-tight', WORD[size])}>
        KAIZEN <span className="neon-gradient-text">EDITION</span>
      </span>
    </span>
  )
}
