import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Mic, Sparkles, Wand2 } from 'lucide-react'
import { BrandMark } from '@/components/common/BrandMark'
import { useT } from '@/i18n'

const FEATURES = [
  {
    icon: Wand2,
    titleKey: 'auth.layout.feature1Title',
    descKey: 'auth.layout.feature1Desc',
    accent: 'var(--neon-1)',
    glow: '[--glow:var(--neon-1)]',
  },
  {
    icon: Mic,
    titleKey: 'auth.layout.feature2Title',
    descKey: 'auth.layout.feature2Desc',
    accent: 'var(--neon-2)',
    glow: '[--glow:var(--neon-2)]',
  },
  {
    icon: Sparkles,
    titleKey: 'auth.layout.feature3Title',
    descKey: 'auth.layout.feature3Desc',
    accent: 'var(--neon-3)',
    glow: '[--glow:var(--neon-3)]',
  },
] as const

export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      {/* Brand / marketing side */}
      <div className="scanline relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        {/* Aurora — two slow-drifting neon blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute -left-[15%] -top-[20%] h-[55vh] w-[55vh] rounded-full bg-[radial-gradient(circle,var(--neon-1),transparent_70%)] opacity-[0.16] blur-3xl" />
          <div className="animate-aurora-slow absolute -bottom-[20%] -right-[10%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle,var(--neon-3),transparent_70%)] opacity-[0.14] blur-3xl" />
        </div>
        {/* Faint perspective grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(120%_90%_at_30%_30%,#000_30%,transparent_85%)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, color-mix(in oklab, var(--neon-1) 8%, transparent) 0, color-mix(in oklab, var(--neon-1) 8%, transparent) 1px, transparent 1px, transparent 44px), repeating-linear-gradient(90deg, color-mix(in oklab, var(--neon-1) 8%, transparent) 0, color-mix(in oklab, var(--neon-1) 8%, transparent) 1px, transparent 1px, transparent 44px)',
          }}
        />

        <div className="relative z-[2]">
          <BrandMark size="md" withWordmark />
        </div>

        <div className="relative z-[2] space-y-8">
          <div className="space-y-3">
            <h1 className="display max-w-md text-4xl font-bold leading-tight">
              {t('auth.layout.heroTitle')}
            </h1>
            <div className="relative h-px max-w-[14rem] overflow-hidden">
              <div className="hairline absolute inset-0" />
              <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-[var(--neon-1)] to-transparent opacity-60" />
            </div>
            <p className="max-w-sm text-muted-foreground">{t('auth.layout.heroDesc')}</p>
          </div>

          <div className="grid gap-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.titleKey}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
                className="glass flex items-center gap-4 rounded-[var(--radius)] p-4"
              >
                <div
                  className={`glow glow-sm grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] border ${f.glow}`}
                  style={{
                    color: f.accent,
                    borderColor: `color-mix(in oklab, ${f.accent} 32%, transparent)`,
                    background: `color-mix(in oklab, ${f.accent} 10%, transparent)`,
                  }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t(f.titleKey)}</p>
                  <p className="text-sm text-muted-foreground">{t(f.descKey)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative z-[2] text-xs text-muted-foreground">{t('auth.layout.footer')}</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center overflow-y-auto p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="glass relative w-full max-w-sm overflow-hidden rounded-[1rem] p-8"
        >
          {/* Corner accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,var(--neon-1),transparent_70%)] opacity-[0.12] blur-2xl"
          />
          {/* Compact brand for lg-down where the hero pane is hidden */}
          <div className="mb-6 flex justify-center lg:hidden">
            <BrandMark size="md" withWordmark />
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  )
}
