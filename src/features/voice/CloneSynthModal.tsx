import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCircle2, Loader2, Mic2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { formatEta } from '@/utils/format'
import type { CloneProgress } from '@/types'

interface Props {
  open: boolean
  phase: CloneProgress['phase']
  percent?: number
  etaSec?: number
  canceling: boolean
  onCancel: () => void
}

// All blocking clone dialogs sit below the ~44px frameless titlebar: the overlay
// starts at it (top-11) and the centered content is nudged down by half of it.
// Full literal class strings so Tailwind's JIT can see them.
const OVERLAY_TOP = 'top-11'
const CONTENT_TOP = 'top-[calc(50%+1.375rem)]'

// Ordered phases for the stepper. 'done' collapses onto the last step.
const STEPS: CloneProgress['phase'][] = ['starting', 'loading', 'generating', 'saving']

export function CloneSynthModal({ open, phase, percent, etaSec, canceling, onCancel }: Props) {
  const t = useT()
  const label =
    phase === 'starting'
      ? t('clone.synth.starting')
      : phase === 'loading'
        ? t('clone.synth.loading')
        : phase === 'saving'
          ? t('clone.synth.saving')
          : phase === 'done'
            ? t('clone.synth.done')
            : t('clone.synth.generating')
  const done = phase === 'done'
  // Determinate whenever we have a real % (generating + the saving tail); the
  // engine-start / model-load phases have no number, so they stay indeterminate.
  const determinate = typeof percent === 'number'
  const eta = formatEta(etaSec)

  // Index of the active step (done → past the last). In the non-done branch
  // `phase` is already narrowed to one of the active STEPS.
  const activeIdx = done ? STEPS.length : STEPS.indexOf(phase)
  const fill = done ? 100 : determinate ? Math.min(100, Math.max(0, percent as number)) : 0

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={`fixed inset-x-0 bottom-0 ${OVERLAY_TOP} z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0`}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={`glass scanline fixed left-1/2 ${CONTENT_TOP} z-50 flex w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[1rem] p-7 focus:outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95`}
        >
          <div className="flex items-center gap-3">
            <div className="glow [--glow:linear-gradient(135deg,var(--neon-1),var(--neon-3))] [--glow-opacity:0.5] grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] bg-gradient-to-br from-primary to-accent text-white">
              <Mic2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogPrimitive.Title className="display text-lg font-semibold tracking-tight">
                {t('clone.synth.title')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t('clone.synth.hint')}
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Phase stepper — the active step glows, completed ones go solid. */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const isActive = i === activeIdx && !done
              const isDone = i < activeIdx || done
              return (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    isDone
                      ? 'bg-[var(--neon-1)]'
                      : isActive
                        ? 'bg-[var(--neon-1)] glow glow-sm [--glow:var(--neon-1)] animate-pulse-glow'
                        : 'bg-white/10'
                  }`}
                />
              )
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-foreground/90">
              <span className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {label}
              </span>
              {(determinate || done) && (
                <span className="numeric text-sm text-[var(--neon-1)]">{Math.round(fill)}%</span>
              )}
            </div>

            {/* Segmented / ticked progress rail. A moving shimmer rides on top so
                even the indeterminate (engine-start / load) phases never look
                stalled. The fill width is driven by % when we have one. */}
            <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-[var(--neon-1)]/15 bg-black/40">
              {/* tick marks */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent 0, transparent 11px, color-mix(in oklab, var(--neon-1) 30%, transparent) 11px, color-mix(in oklab, var(--neon-1) 30%, transparent) 12px)',
                }}
              />
              {determinate || done ? (
                <div
                  className="relative h-full rounded-full bg-[linear-gradient(90deg,var(--neon-1),var(--neon-2),var(--neon-3))] transition-[width] duration-300 ease-out"
                  style={{ width: `${fill}%` }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-[-1px] right-[-3px] w-2 rounded-full bg-[var(--neon-3)] opacity-70 blur-[3px]"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="absolute inset-y-0 w-1/3 animate-shimmer rounded-full bg-[linear-gradient(90deg,transparent,var(--neon-1),var(--neon-3),transparent)] opacity-90"
                />
              )}
            </div>

            {determinate && eta && (
              <p className="numeric text-right text-[11px] text-muted-foreground">
                {t('clone.model.remaining', { t: eta })}
              </p>
            )}
          </div>

          {!done && (
            <div className="flex justify-end">
              <Button variant="destructive" onClick={onCancel} disabled={canceling}>
                {canceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 fill-current" />
                )}
                {t('clone.synth.stop')}
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
