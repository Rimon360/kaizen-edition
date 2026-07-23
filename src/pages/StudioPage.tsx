import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { cn } from '@/utils/cn'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useIsRendering } from '@/store/renderStore'
import { ConfigPanel } from '@/features/config/ConfigPanel'
import { PreviewPanel } from '@/features/preview/PreviewPanel'
import { QueuePanel } from '@/features/queue/QueuePanel'
import { VoicePanel } from '@/features/voice/VoicePanel'
import { ExportPanel } from '@/features/export/ExportPanel'

const col = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

/**
 * Responsive Studio.
 *  • ≥ xl (1280px): three columns fill the viewport height; each panel scrolls
 *    internally (outer container is overflow-hidden). Column min widths leave
 *    comfortable room at 1280 so nothing is ever clipped.
 *  • < xl: a single scrolling column of full-width panels (capped by max-w, so
 *    they stay wide, not cramped). Panels get explicit/viewport heights so their
 *    internal ScrollAreas still work, and the whole page scrolls.
 *  • Ultra-wide: capped at max-w to keep the columns comfortably sized.
 */
/**
 * Cinematic render-lock overlay. While a render runs, every non-live panel is
 * frozen: clicks/keys are killed by `inert` + pointer-events, and the panel reads
 * as "powered down" — a soft blur + desaturate veil with a single neon sweep line
 * scanning top→bottom. It sits absolutely inside an already `overflow-hidden`
 * Card, so it clips to the brand radius without touching layout.
 */
function LockVeil() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[var(--radius)] [backdrop-filter:blur(2px)_saturate(0.45)]"
    >
      {/* dimming wash so the frozen surface recedes behind the live Queue */}
      <div className="absolute inset-0 bg-[var(--background)]/35" />
      {/* single neon sweep line scanning top→bottom. The full-height wrapper is
          what translateY animates against, so the thin line at its top edge
          travels the whole panel (a 1px element would barely move). */}
      <div className="absolute inset-x-0 top-0 h-full animate-scan">
        <div className="h-px w-full bg-[linear-gradient(90deg,transparent,var(--neon-1),transparent)] opacity-70" />
      </div>
    </div>
  )
}

export function StudioPage() {
  // While a render is in progress the whole studio locks: every panel is made
  // `inert` (no focus, clicks, or keyboard) and dimmed. The only exceptions are
  // the Cancel button + live progress in the Queue panel (which lock their own
  // inputs internally) and the window controls.
  const busy = useIsRendering()
  // Frozen panels: kill interaction but DON'T fade with opacity — the cinematic
  // LockVeil (blur + desaturate + sweep) carries the "powered down" read instead.
  const lock = cn('relative transition-[filter] duration-300', busy && 'pointer-events-none select-none')
  const lockProps = { inert: busy || undefined }

  return (
    <div className="h-full overflow-y-auto xl:overflow-hidden">
      <div className="mx-auto grid min-h-full max-w-[1760px] grid-cols-1 content-start gap-4 p-3 sm:p-4 xl:h-full xl:grid-cols-[minmax(340px,0.9fr)_minmax(360px,1.08fr)_minmax(340px,0.92fr)] xl:content-stretch">
        {/* Left column — Configuration + Preview */}
        <motion.div
          variants={col}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-4 xl:min-h-0"
        >
          {/* Settings card has a FIXED height so it never resizes as accordion sections
              open/close: on xl it flexes to fill the column beside the fixed Preview;
              below xl it's pinned at 58vh (min 460px). ConfigPanel fills it and the open
              section scrolls inside (scrollbar hidden) — so the card height never jumps. */}
          <Card
            className={cn(
              'flex h-[58vh] min-h-[460px] flex-col overflow-hidden xl:h-auto xl:min-h-0 xl:flex-1',
              lock,
            )}
            {...lockProps}
          >
            <ErrorBoundary label="config"><ConfigPanel /></ErrorBoundary>
            {busy && <LockVeil />}
          </Card>
          <Card
            className={cn('h-[300px] shrink-0 overflow-hidden sm:h-[340px] xl:h-[360px]', lock)}
            {...lockProps}
          >
            <ErrorBoundary label="preview"><PreviewPanel /></ErrorBoundary>
            {busy && <LockVeil />}
          </Card>
        </motion.div>

        {/* Center column — Video queue */}
        <motion.div
          variants={col}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.3, delay: 0.05 }}
          className="xl:min-h-0"
        >
          {/* Center Queue is the focal column: a slightly stronger neon edge always,
              and while a render runs it's the ONE live panel — a pulsing cyan ring
              marks it as the only interactive surface amid the frozen others. */}
          <Card
            className={cn(
              'relative flex h-[78vh] min-h-[520px] flex-col overflow-hidden border-[var(--neon-1)]/25 xl:h-full xl:min-h-0',
              busy && 'border-[var(--neon-1)]/45',
            )}
          >
            <ErrorBoundary label="queue"><QueuePanel /></ErrorBoundary>
            {busy && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 animate-pulse-glow rounded-[var(--radius)] border border-[var(--neon-1)]/60"
              />
            )}
          </Card>
        </motion.div>

        {/* Right column — Voice generation + Export */}
        <motion.div
          variants={col}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-col gap-4 xl:min-h-0"
        >
          <Card
            className={cn(
              'flex h-[58vh] min-h-[460px] flex-col overflow-hidden xl:h-auto xl:min-h-0 xl:flex-1',
              lock,
            )}
            {...lockProps}
          >
            <ErrorBoundary label="voice"><VoicePanel /></ErrorBoundary>
            {busy && <LockVeil />}
          </Card>
          <Card className={cn('shrink-0 overflow-hidden', lock)} {...lockProps}>
            <ErrorBoundary label="export"><ExportPanel /></ErrorBoundary>
            {busy && <LockVeil />}
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
