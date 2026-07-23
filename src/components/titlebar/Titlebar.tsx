import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { electronApi, isElectron } from '@/lib/electron'
import { cn } from '@/utils/cn'
import { useT } from '@/i18n'
import { useAuthStore } from '@/store/authStore'
import { useIsRendering } from '@/store/renderStore'
import { useVoiceStore } from '@/store/voiceStore'
import { BrandMark } from '@/components/common/BrandMark'
import { UserMenu } from './UserMenu'
import { UpdateBadge } from './UpdateBadge'
import { ProjectMenu } from './ProjectMenu'

function WindowButton({
  onClick,
  className,
  children,
  label,
}: {
  onClick: () => void
  className?: string
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'no-drag grid h-full w-12 place-items-center text-muted-foreground transition-colors hover:bg-[var(--neon-1)]/10 hover:text-[var(--neon-1)] active:bg-[var(--neon-1)]/15',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Titlebar() {
  const t = useT()
  const [maximized, setMaximized] = useState(false)
  const token = useAuthStore((s) => s.token)
  // Lock project + account actions during a render OR a transcription (window
  // controls stay live). The transcription modal leaves the titlebar uncovered,
  // so without this New Project / Open / Logout could bypass the modal and orphan
  // the whisper worker.
  const transcribing = useVoiceStore((s) => s.transcribing)
  const cloneSynthesizing = useVoiceStore((s) => s.cloneSynthesizing)
  const busy = useIsRendering() || !!transcribing || cloneSynthesizing
  const lock = cn('transition-opacity', busy && 'pointer-events-none opacity-50')
  // On Windows the OS draws native min/max/close (titleBarOverlay). We hide our own
  // buttons there and reserve room on the right so the menus don't sit under them.
  const nativeChrome = isElectron && electronApi?.platform === 'win32'

  useEffect(() => {
    if (!electronApi) return
    electronApi.window
      .isMaximized()
      .then(setMaximized)
      .catch((err) => console.warn('[Titlebar] isMaximized failed:', err))
    return electronApi.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <header
      className="drag relative flex h-11 shrink-0 items-center justify-between border-b border-border bg-[var(--titlebar)]/85 pl-4 backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--neon-1)_40%,transparent),transparent)]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <BrandMark size="sm" withWordmark />
        {token && (
          <>
            <span className="mx-1 h-4 w-px bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--neon-1)_30%,transparent),transparent)]" />
            <span className={lock} inert={busy || undefined}>
              <ProjectMenu />
            </span>
          </>
        )}
      </div>

      <div className="flex h-full items-center">
        <div
          className={cn('no-drag flex items-center gap-2', nativeChrome ? 'pr-[140px]' : 'pr-2', lock)}
          inert={busy || undefined}
        >
          <UpdateBadge />
          <UserMenu />
        </div>

        {/* Custom buttons only where the OS doesn't draw native ones (macOS/Linux). */}
        {isElectron && !nativeChrome && (
          <div className="flex h-full items-stretch">
            <WindowButton label={t('titlebar.minimize')} onClick={() => electronApi?.window.minimize()}>
              <Minus className="h-4 w-4" />
            </WindowButton>
            <WindowButton
              label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
              onClick={() => electronApi?.window.toggleMaximize()}
            >
              {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3 w-3" />}
            </WindowButton>
            <WindowButton
              label={t('titlebar.close')}
              onClick={() => electronApi?.window.close()}
              className="hover:bg-[var(--neon-3)]/15 hover:text-[var(--neon-3)] active:bg-[var(--neon-3)]/25"
            >
              <X className="h-4 w-4" />
            </WindowButton>
          </div>
        )}
      </div>
    </header>
  )
}
