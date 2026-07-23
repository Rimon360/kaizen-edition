import { useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useT } from '@/i18n'
import { formatEta } from '@/utils/format'
import type { TranscribeProgress } from '@/types'

interface Props {
  open: boolean
  phase: TranscribeProgress['phase']
  /** Real progress percent reported by the worker (download / load / inference). */
  percent: number
  /** Estimated seconds remaining (inference). */
  etaSec?: number
  /** Localized status line (phase + percent). */
  label: string
  /** Live partial transcript streamed from the model. */
  partialText: string
  canceling: boolean
  onCancel: () => void
}

/**
 * Blocking, full-window modal shown while audio is being transcribed into
 * subtitles. It deliberately can't be dismissed by Esc / clicking outside — the
 * only way out is the Stop button — so the user can't kick off an export and
 * wonder why subtitles are missing. The overlay starts below the titlebar so the
 * window controls stay usable during a long run.
 */
export function TranscribeModal({
  open,
  phase,
  percent,
  etaSec,
  label,
  partialText,
  canceling,
  onCancel,
}: Props) {
  const t = useT()
  const previewRef = useRef<HTMLDivElement | null>(null)

  // Keep the live preview pinned to the newest words.
  useEffect(() => {
    const el = previewRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [partialText])

  // The ring is determinate during download / inference, and spins as an
  // indeterminate sweep while the model loads (or before the first download tick).
  const indeterminate = phase === 'loading' || (phase === 'downloading' && percent === 0)
  const pct = Math.min(100, Math.max(0, percent))
  const eta = phase === 'transcribing' ? formatEta(etaSec) : ''

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scanline fixed inset-x-0 bottom-0 top-11 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="glass fixed left-1/2 top-[calc(50%+1.375rem)] z-50 flex max-h-[80vh] w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[1rem] p-7 focus:outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-3">
            <div className="glow [--glow:linear-gradient(135deg,var(--neon-1),var(--neon-3))] [--glow-opacity:0.5] grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] bg-gradient-to-br from-primary to-accent text-white">
              <Mic className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogPrimitive.Title className="display text-lg font-semibold tracking-tight">
                {t('config.transcribeModalTitle')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t('config.transcribeModalHint')}
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Focal element: a conic neon progress ring. The .numeric percent sits at
              center with the ETA below; the status line runs underneath. */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative grid h-36 w-36 place-items-center">
              {/* soft halo behind the ring */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-3 rounded-full bg-[var(--neon-1)] opacity-20 blur-2xl"
              />
              {/* the ring: a conic disc with a solid center plug punching out the hole
                  (no mask — mask doesn't render reliably in Electron). */}
              <div
                aria-hidden
                className={cn(
                  'absolute inset-0 rounded-full',
                  indeterminate &&
                    'animate-spin-slow bg-[conic-gradient(from_0deg,transparent,var(--neon-1),transparent_55%)]',
                )}
                style={
                  indeterminate
                    ? undefined
                    : {
                        background: `conic-gradient(from -90deg, var(--neon-1), var(--neon-2) ${pct * 0.6}%, var(--neon-3) ${pct}%, color-mix(in oklab, #fff 8%, transparent) ${pct}% 100%)`,
                      }
                }
              />
              {/* center plug — creates the ring hollow; matches the glass surface */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[11px] rounded-full border border-white/5 bg-[var(--card)]"
              />
              {/* center readout */}
              <div className="relative z-10 flex flex-col items-center">
                {indeterminate ? (
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--neon-1)]" />
                ) : (
                  <span className="numeric text-3xl font-semibold leading-none text-[var(--neon-1)] [text-shadow:0_0_18px_color-mix(in_oklab,var(--neon-1)_45%,transparent)]">
                    {pct}
                    <span className="text-base text-[var(--neon-1)]/60">%</span>
                  </span>
                )}
                {eta && (
                  <span className="numeric mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {eta}
                  </span>
                )}
              </div>
            </div>
            {/* status line */}
            <span className="flex items-center gap-2 text-[13px] text-foreground/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--neon-1)]" />
              {label}
            </span>
          </div>

          {phase === 'transcribing' && (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              {/* terminal frame: top label chip + mono body */}
              <span className="hud-chip self-start px-2 py-0.5">
                {t('config.transcribeLivePreview')}
              </span>
              <div
                ref={previewRef}
                className="scroll-fade min-h-[84px] flex-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--neon-1)]/20 bg-black/40 p-3 font-mono text-[13px] leading-relaxed text-foreground/85"
              >
                {partialText ? (
                  <>
                    <span className="text-[var(--neon-1)]/60">{'> '}</span>
                    {partialText}
                    <span className="ml-0.5 inline-block h-[1.05em] w-[7px] translate-y-[2px] animate-pulse-glow bg-[var(--neon-1)] align-middle" />
                  </>
                ) : (
                  <span className="text-muted-foreground">{'> _'}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="destructive" onClick={onCancel} disabled={canceling}>
              {canceling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4 fill-current" />
              )}
              {canceling ? t('config.transcribeCanceling') : t('config.transcribeStop')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
