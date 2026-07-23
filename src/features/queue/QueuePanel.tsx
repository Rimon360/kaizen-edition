import { useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Upload,
  FolderOpen,
  Wand2,
  Play,
  Film,
  Layers,
  ArrowDownAZ,
} from 'lucide-react'
import { toast } from 'sonner'
import { SectionHeading } from '@/components/common/SectionHeading'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/utils/cn'
import { formatEta } from '@/utils/format'
import { electronApi } from '@/lib/electron'
import { useQueueStore } from '@/store/queueStore'
import { useConfigStore } from '@/store/configStore'
import { useRenderStore } from '@/store/renderStore'
import { useRender } from '@/features/export/useRender'
import { TEMPLATES } from '@/features/config/constants'
import { useT } from '@/i18n'
import { QueueItemRow } from './QueueItemRow'

const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|m4v)$/i

export function QueuePanel() {
  const items = useQueueStore((s) => s.items)
  const addPaths = useQueueStore((s) => s.addPaths)
  const clear = useQueueStore((s) => s.clear)
  const sort = useQueueStore((s) => s.sort)
  const template = useConfigStore((s) => s.template)
  const setTemplate = useConfigStore((s) => s.setTemplate)
  const render = useRenderStore()
  const logs = useRenderStore((s) => s.logs)
  const { run, cancel, isRunning } = useRender()
  const t = useT()
  const [dragging, setDragging] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const browse = async () => {
    if (!electronApi) return toast.error(t('common.desktopOnly'))
    const res = await electronApi.dialog.openVideos()
    if (!res.canceled && res.paths.length) addPaths(res.paths)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const api = electronApi
    if (!api) return
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.getPathForFile(f))
      .filter((p) => p && VIDEO_EXT.test(p))
    if (paths.length) addPaths(paths)
    else if (e.dataTransfer.files.length) toast.error(t('queue.invalidType'))
  }

  const statusText =
    render.status === 'idle'
      ? t('queue.status.idle')
      : render.status === 'done'
        ? t('queue.status.done')
        : render.status === 'error'
          ? t('queue.status.error', { error: render.error ?? '' })
          : render.status === 'canceled'
            ? t('queue.status.canceled')
            : render.stage || t('queue.status.processing')

  // While rendering, lock the queue's inputs (upload, template, drop zone, list)
  // but keep the process-controls footer live so Cancel + progress stay usable.
  const lock = cn('transition-opacity', isRunning && 'pointer-events-none select-none opacity-60')
  const lockProps = { inert: isRunning || undefined }

  return (
    <div className="flex h-full flex-col">
      <div className={cn('space-y-3 p-5 pb-3', lock)} {...lockProps}>
        <SectionHeading title={t('queue.uploadHeading')} />
        <Button variant="gradient" className="w-full" onClick={browse}>
          <Upload className="h-4 w-4" />
          {t('queue.uploadManually')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('queue.uploadHint')}
        </p>

        <div className="rounded-[var(--radius)] border border-border/60 bg-black/20 p-3">
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/55 display">
            {t('queue.templateLabel')}
          </label>
          <Select value={template} onValueChange={(v) => setTemplate(v as typeof template)}>
            <SelectTrigger>
              {/* div (not span) so the trigger's [&>span]:line-clamp-1 can't override
                  display:flex and break the icon/text vertical centering. */}
              <div className="flex min-w-0 items-center gap-2">
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">
                  <SelectValue />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t_) => (
                <SelectItem key={t_.value} value={t_.value}>
                  {t('queue.tpl.' + t_.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Short explanation of the selected template (manual: "text below"). */}
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {t('queue.tpl.' + template + '.desc')}
          </p>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {t('queue.orderHint')}
        </p>
      </div>

      {/* Drop zone / list */}
      <div className={cn('flex-1 px-5', lock)} {...lockProps}>
        <div
          onDragEnter={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragging) setDragging(true)
          }}
          onDragLeave={(e) => {
            // Only clear when the pointer actually leaves the drop target,
            // not when it moves over a child element.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={onDrop}
          className={cn(
            'relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] p-[1px] transition-colors',
            'bg-[length:16px_2px,16px_2px,2px_16px,2px_16px] bg-[position:0_0,0_100%,0_0,100%_0] bg-no-repeat',
            dragging
              ? 'animate-marching bg-[image:repeating-linear-gradient(90deg,var(--neon-1)_0_8px,transparent_8px_16px),repeating-linear-gradient(90deg,var(--neon-1)_0_8px,transparent_8px_16px),repeating-linear-gradient(0deg,var(--neon-1)_0_8px,transparent_8px_16px),repeating-linear-gradient(0deg,var(--neon-1)_0_8px,transparent_8px_16px)]'
              : 'bg-[image:repeating-linear-gradient(90deg,var(--border)_0_8px,transparent_8px_16px),repeating-linear-gradient(90deg,var(--border)_0_8px,transparent_8px_16px),repeating-linear-gradient(0deg,var(--border)_0_8px,transparent_8px_16px),repeating-linear-gradient(0deg,var(--border)_0_8px,transparent_8px_16px)]',
          )}
        >
          <div
            className={cn(
              'relative flex h-full flex-col rounded-[calc(var(--radius)-1px)] transition-colors',
              dragging ? 'bg-[var(--neon-1)]/10' : 'bg-black/10',
            )}
          >
          {dragging && (
            <>
              {/* Scan sweep across the active drop target */}
              <span
                aria-hidden
                className="animate-scan pointer-events-none absolute inset-x-0 top-0 z-20 h-1/3 bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--neon-1)_22%,transparent),transparent)]"
              />
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[calc(var(--radius)-1px)] bg-[var(--neon-1)]/12 backdrop-blur-sm">
                <Upload className="h-9 w-9 text-primary" />
                <p className="display neon-text text-base font-semibold uppercase tracking-[0.12em] text-primary">{t('queue.dropToAdd')}</p>
              </div>
            </>
          )}
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <div className="grid h-14 w-14 place-items-center rounded-[var(--radius)] border border-[var(--neon-1)]/20 bg-[var(--neon-1)]/5">
                <Film className="h-7 w-7 text-[var(--neon-1)]/50" />
              </div>
              <p className="display text-lg">{t('queue.dropHint')}</p>
              <Button variant="outline" size="sm" onClick={browse}>
                <FolderOpen className="h-4 w-4" />
                {t('queue.browse')}
              </Button>
            </div>
          ) : (
            <ScrollArea className="scroll-fade flex-1">
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 text-[var(--neon-1)]/70" />
                  {items.length === 1
                    ? t('queue.clipCount.one', { n: items.length })
                    : t('queue.clipCount.other', { n: items.length })}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    className="flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={sort}
                    title={t('queue.autoSort')}
                  >
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                    {t('queue.autoSort')}
                  </button>
                  <button
                    className="rounded text-xs text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() =>
                      toast(t('queue.clearConfirm'), {
                        action: {
                          label: t('queue.clearConfirmAction'),
                          // The confirm toast lives in a portal outside the inert
                          // lock, so re-check render state at click time — never
                          // wipe the queue mid-render.
                          onClick: () => {
                            const s = useRenderStore.getState().status
                            if (s !== 'preparing' && s !== 'rendering') clear()
                          },
                        },
                      })
                    }
                  >
                    {t('queue.clear')}
                  </button>
                </div>
              </div>
              <div className="space-y-2 p-3 pt-1">
                <AnimatePresence initial={false}>
                  {items.map((item, i) => (
                    <QueueItemRow key={item.id} item={item} index={i} total={items.length} />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
          </div>
        </div>
      </div>

      {/* Process controls + status */}
      <div className="space-y-3 p-5 pt-3">
        {/* EXPORT label + fading hairline */}
        <div className="flex items-center gap-2">
          <span className="display text-[10px] uppercase tracking-[0.2em] text-foreground/45">
            EXPORT
          </span>
          <span className="hairline flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {isRunning ? (
            <Button variant="destructive" className="col-span-2" onClick={cancel}>
              {t('queue.cancel')}
            </Button>
          ) : (
            <>
              {/* Primary CTA owns the row */}
              <Button
                variant="gradient"
                className="col-span-2"
                onClick={() => run('mp4', { applyEdits: true })}
                disabled={items.length === 0}
                title={t('queue.processEdit.title')}
              >
                <Wand2 className="h-4 w-4" />
                {t('queue.processEdit')}
              </Button>
              {/* Quiet glass-outline secondary */}
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => run('mp4', { applyEdits: false })}
                disabled={items.length === 0}
                title={t('queue.processRaw.title')}
              >
                <Play className="h-4 w-4" />
                {t('queue.processRaw')}
              </Button>
            </>
          )}
        </div>

        <div className="rounded-[var(--radius)] border border-border/60 bg-black/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {/* Status LED — pulses while processing, mapped per state */}
              <span
                aria-hidden
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  render.status === 'error'
                    ? 'bg-destructive'
                    : render.status === 'done'
                      ? 'bg-success'
                      : render.status === 'rendering' || render.status === 'preparing'
                        ? 'animate-pulse-glow bg-[var(--neon-1)]'
                        : 'bg-muted-foreground/40',
                )}
              />
              <span
                className={cn(
                  'truncate text-sm',
                  render.status === 'error'
                    ? 'text-destructive'
                    : render.status === 'done'
                      ? 'text-success'
                      : 'text-foreground/90',
                )}
              >
                {statusText}
              </span>
            </span>
            {(render.status === 'rendering' || render.status === 'preparing') && (
              <span className="flex shrink-0 items-baseline gap-2">
                {formatEta(render.etaSec) && (
                  <span className="numeric text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatEta(render.etaSec)}
                  </span>
                )}
                <span className="numeric text-2xl font-semibold leading-none text-[var(--neon-1)] [text-shadow:0_0_14px_color-mix(in_oklab,var(--neon-1)_50%,transparent)]">
                  {render.percent}
                  <span className="text-sm opacity-60">%</span>
                </span>
              </span>
            )}
          </div>
          {(render.status === 'rendering' || render.status === 'preparing') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5">
              <Progress value={render.percent} indeterminate={render.percent === 0} />
            </motion.div>
          )}

          {logs.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowLog((v) => !v)}
                className="numeric text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-[var(--neon-1)]"
              >
                {showLog ? t('queue.log.hide') : t('queue.log.show')}
              </button>
              {showLog && (
                <div className="mt-1.5 overflow-hidden rounded-[0.5rem] border border-[var(--neon-1)]/20 bg-black/50">
                  {/* Terminal HUD header */}
                  <div className="flex items-center gap-2 border-b border-[var(--neon-1)]/15 px-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-1)]/60" />
                    <span className="numeric text-[9px] uppercase tracking-[0.16em] text-[var(--neon-1)]/70">
                      LOG // ffmpeg
                    </span>
                  </div>
                  <pre className="scroll-fade max-h-28 overflow-auto p-2 font-mono text-[10px] leading-relaxed text-[var(--neon-1)]/55">
                    {logs.map((l) => l.text).join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
