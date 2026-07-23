import { useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Download, Loader2, Square, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { electronApi } from '@/lib/electron'
import { useCloneStore } from '@/store/cloneStore'
import { useT } from '@/i18n'
import type { ModelProgress } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onInstalled?: () => void
}

const gb = (b: number) => (b / 1e9).toFixed(2)

// Sits below the ~44px frameless titlebar: overlay starts at it (top-11), the
// centered content is nudged down by half. Full literal strings for the JIT.
const OVERLAY_TOP = 'top-11'
const CONTENT_TOP = 'top-[calc(50%+1.375rem)]'

/**
 * First-run model download. The ~3 GB Chatterbox model isn't shipped in the
 * installer (NSIS size limit + it shouldn't ride along on every app update), so
 * it downloads once into userData here, with real byte progress. Cached forever.
 */
export function ModelDownloadModal({ open, onClose, onInstalled }: Props) {
  const t = useT()
  const total = useCloneStore((s) => s.modelStatus?.totalBytes ?? 3_208_951_748)
  const [downloading, setDownloading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [progress, setProgress] = useState<ModelProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [etaSec, setEtaSec] = useState<number | null>(null)
  // Rolling rate (smoothed) over ~1s windows, used to estimate time remaining.
  const startRef = useRef<{ t: number; b: number } | null>(null)
  const lastRef = useRef<{ t: number; b: number } | null>(null)
  const bpsRef = useRef(0)

  const start = async () => {
    if (!electronApi?.clone.model) return
    setError(null)
    setCanceling(false)
    setProgress(null)
    setEtaSec(null)
    startRef.current = null
    lastRef.current = null
    bpsRef.current = 0
    setDownloading(true)
    const off = electronApi.clone.model.onProgress((p) => {
      const now = Date.now()
      if (!startRef.current) {
        startRef.current = { t: now, b: p.receivedBytes }
        lastRef.current = { t: now, b: p.receivedBytes }
      } else if (lastRef.current && now - lastRef.current.t >= 1000) {
        const dt = now - lastRef.current.t
        const inst = ((p.receivedBytes - lastRef.current.b) / dt) * 1000 // bytes/sec
        bpsRef.current = bpsRef.current ? bpsRef.current * 0.5 + inst * 0.5 : inst
        lastRef.current = { t: now, b: p.receivedBytes }
        setEtaSec(bpsRef.current > 0 ? (p.totalBytes - p.receivedBytes) / bpsRef.current : null)
      }
      setProgress(p)
    })
    try {
      const res = await electronApi.clone.model.download()
      off()
      setDownloading(false)
      if (res.canceled) return
      if (!res.ok) {
        setError(t(res.error || 'clone.model.failed'))
        return
      }
      await useCloneStore.getState().refreshModelStatus()
      onInstalled?.()
      onClose()
    } catch (e) {
      off()
      setDownloading(false)
      setError((e as Error).message || t('clone.model.failed'))
    }
  }

  const cancel = () => {
    setCanceling(true)
    electronApi?.clone.model.cancel()
  }

  const received = progress?.receivedBytes ?? 0
  const tot = progress?.totalBytes || total
  const pct = tot ? Math.min(100, Math.round((received / tot) * 100)) : 0
  const etaLabel =
    etaSec == null || !isFinite(etaSec) || etaSec < 0
      ? t('clone.model.calculating')
      : etaSec < 60
        ? t('clone.model.remaining', { t: `${Math.max(1, Math.ceil(etaSec))} s` })
        : etaSec < 3600
          ? t('clone.model.remaining', { t: `${Math.ceil(etaSec / 60)} min` })
          : t('clone.model.remaining', { t: `${(etaSec / 3600).toFixed(1)} h` })

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
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogPrimitive.Title className="display text-lg font-semibold tracking-tight">
                {t('clone.model.title')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t('clone.model.desc', { gb: gb(total) })}
              </DialogPrimitive.Description>
            </div>
          </div>

          {downloading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-foreground/90">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {t('clone.model.downloading')}
                </span>
                <span className="numeric text-sm text-[var(--neon-1)]">{pct}%</span>
              </div>
              {/* Ticked neon rail. Before the first byte arrives (pct 0) it runs a
                  moving shimmer so it never reads as stalled. */}
              <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-[var(--neon-1)]/15 bg-black/40">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, transparent 0, transparent 11px, color-mix(in oklab, var(--neon-1) 30%, transparent) 11px, color-mix(in oklab, var(--neon-1) 30%, transparent) 12px)',
                  }}
                />
                {pct > 0 ? (
                  <div
                    className="relative h-full rounded-full bg-[linear-gradient(90deg,var(--neon-1),var(--neon-2),var(--neon-3))] transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%` }}
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
              <div className="flex items-center justify-between numeric text-[11px] text-muted-foreground">
                <span>{etaLabel}</span>
                <span>
                  {gb(received)} / {gb(tot)} GB
                </span>
              </div>
            </div>
          ) : error ? (
            <p className="rounded-[var(--radius)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              {error}
            </p>
          ) : (
            <p className="rounded-[var(--radius)] border border-border/60 bg-black/15 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t('clone.model.note')}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {downloading ? (
              <Button variant="destructive" onClick={cancel} disabled={canceling}>
                {canceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 fill-current" />
                )}
                {t('clone.model.cancelBtn')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  {t('clone.model.later')}
                </Button>
                <Button onClick={start}>
                  <Download className="h-4 w-4" />
                  {error ? t('clone.model.retry') : t('clone.model.downloadBtn')}
                </Button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
