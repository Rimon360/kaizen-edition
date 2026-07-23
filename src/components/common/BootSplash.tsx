import { motion } from 'framer-motion'
import { BrandMark } from '@/components/common/BrandMark'
import { useT } from '@/i18n'

export function BootSplash() {
  const t = useT()
  return (
    <div
      role="status"
      aria-live="polite"
      className="scanline relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {/* Faint animated neon grid backdrop — drifts upward, no layout cost (transform only). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 motion-safe:animate-marching [animation-duration:14s] [background-image:linear-gradient(color-mix(in_oklab,var(--neon-1)_8%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--neon-1)_8%,transparent)_1px,transparent_1px)] [background-size:42px_42px] opacity-40"
        style={{
          maskImage:
            'radial-gradient(60% 55% at 50% 50%, #000 0%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(60% 55% at 50% 50%, #000 0%, transparent 78%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex w-[280px] flex-col items-center gap-6"
      >
        {/* Glyph wrapped in a rotating conic neon ring (mask carves the ring out). */}
        <div className="relative grid h-24 w-24 place-items-center">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-80 motion-safe:animate-spin-slow [background:conic-gradient(from_0deg,transparent,var(--neon-1),transparent_40%,var(--neon-3),transparent_80%)]"
            style={{
              maskImage:
                'radial-gradient(closest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
              WebkitMaskImage:
                'radial-gradient(closest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
            }}
          />
          <div
            aria-hidden
            className="absolute inset-[6px] rounded-full border border-[var(--neon-1)]/10"
          />
          <BrandMark size="lg" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="display text-lg font-semibold tracking-tight">
            KAIZEN <span className="neon-gradient-text">EDITION</span>
          </p>

          {/* Indeterminate cyan→magenta progress sweep. */}
          <div className="relative h-px w-44 overflow-hidden rounded-full bg-white/10">
            <div
              aria-hidden
              className="absolute inset-y-0 -left-1/3 w-1/3 motion-safe:animate-shimmer [animation-duration:1.4s] [background:linear-gradient(90deg,transparent,var(--neon-1),var(--neon-3),transparent)]"
            />
          </div>

          <p className="numeric text-[10px] uppercase tracking-[0.22em] text-[var(--neon-1)]/80">
            {t('common.appStarting')}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
