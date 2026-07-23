import { FileVideo, FileAudio, FolderOpen, CheckCircle2, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { electronApi } from '@/lib/electron'
import { truncateMiddle } from '@/utils/format'
import { useRenderStore } from '@/store/renderStore'
import { useQueueStore } from '@/store/queueStore'
import { useConfigStore } from '@/store/configStore'
import { useVoiceStore } from '@/store/voiceStore'
import { useT } from '@/i18n'
import { useRender } from './useRender'

export function ExportPanel() {
  const t = useT()
  const { run, isRunning } = useRender()
  const status = useRenderStore((s) => s.status)
  const percent = useRenderStore((s) => s.percent)
  const stage = useRenderStore((s) => s.stage)
  const error = useRenderStore((s) => s.error)
  const outputPath = useRenderStore((s) => s.outputPath)

  // Reflect impossible actions up front (matching the Queue panel) instead of
  // only surfacing them as post-click toasts.
  const queueCount = useQueueStore((s) => s.items.length)
  const voiceText = useVoiceStore((s) => s.text)
  const voiceOverFile = useConfigStore((s) => s.voiceOverFile)
  // Block export while a transcription is in flight (the modal also covers the
  // UI, but disabling the buttons is clearer and defends against any gap).
  const transcribing = useVoiceStore((s) => s.transcribing)
  const cloneSynthesizing = useVoiceStore((s) => s.cloneSynthesizing)

  const busy = isRunning || !!transcribing || cloneSynthesizing
  const mp4Disabled = busy || queueCount === 0
  const wavDisabled = busy || (!voiceText.trim() && !voiceOverFile)
  const inProgress = status === 'preparing' || status === 'rendering'

  // Only surface a reason for the "missing input" block (not the transient busy
  // lock — the progress bar / modal already explains that).
  const mp4Reason = !busy && queueCount === 0 ? t('export.addVideo') : null
  const wavReason = !busy && !voiceText.trim() && !voiceOverFile ? t('export.noAudio') : null

  return (
    <div className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="space-y-2.5">
        {/* HERO — MP4. Tall full-width gradient glass with a glowing video chip and
            a scanline sheen. Clearly the primary action. */}
        <button
          type="button"
          onClick={() => run('mp4')}
          disabled={mp4Disabled}
          title={mp4Reason ?? undefined}
          className="no-drag scanline group relative isolate flex w-full items-center gap-4 overflow-hidden rounded-[var(--radius)] border border-white/15 bg-gradient-to-br from-primary/90 to-accent/90 px-5 py-5 text-left transition-all duration-150 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:bg-[linear-gradient(to_right,var(--neon-1),var(--neon-3))] after:opacity-50 after:blur-md after:transition-opacity enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:brightness-110 enabled:hover:after:opacity-80 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 disabled:after:opacity-0"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius)] border border-white/25 bg-white/10 text-white">
            {isRunning ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : mp4Disabled ? (
              <Lock className="h-5 w-5" />
            ) : (
              <FileVideo className="h-6 w-6" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="display text-base font-bold tracking-tight text-white">{t('export.mp4')}</span>
            {mp4Reason && (
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-white/30 bg-black/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/85">
                <Lock className="h-2.5 w-2.5" />
                {mp4Reason}
              </span>
            )}
          </span>
        </button>

        {/* WAV — slimmer ghost-glass secondary action beneath the hero. */}
        <button
          type="button"
          onClick={() => run('wav')}
          disabled={wavDisabled}
          title={wavReason ?? undefined}
          className="no-drag group relative flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--neon-1)]/25 bg-white/[0.03] px-4 py-3 text-left backdrop-blur-sm transition-all duration-150 enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--neon-1)]/55 enabled:hover:bg-white/[0.06] enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--neon-1)]/25 bg-[var(--neon-1)]/10 text-[var(--neon-1)]">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : wavDisabled ? (
              <Lock className="h-4 w-4" />
            ) : (
              <FileAudio className="h-4 w-4" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] font-medium text-foreground/90">{t('export.wav')}</span>
            {wavReason && (
              <span className="hud-chip w-fit px-2 py-0.5">
                <Lock className="h-2.5 w-2.5" />
                {wavReason}
              </span>
            )}
          </span>
        </button>
      </div>

      {inProgress && (
        <div className="space-y-2 rounded-[var(--radius)] border border-border/60 bg-black/20 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/90">{stage || t('export.processing')}</span>
            <span className="numeric text-[var(--neon-1)]">{percent}%</span>
          </div>
          <Progress value={percent} indeterminate={percent === 0} />
        </div>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {status === 'done' && outputPath && (
        <button
          onClick={() => electronApi?.shell.showInFolder(outputPath)}
          aria-label={t('export.openFolder')}
          className="no-drag flex items-center gap-2 rounded-[var(--radius)] border border-success/30 bg-success/10 px-3 py-2 text-left transition-colors hover:bg-success/15"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
            {truncateMiddle(outputPath.split(/[\\/]/).pop() ?? '', 26)}
          </span>
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <div className="flex justify-end">
        <span className="hud-chip numeric px-2 py-0.5">KAIZEN EDITION v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
