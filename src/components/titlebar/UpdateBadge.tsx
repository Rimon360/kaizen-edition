import { useEffect, useState } from 'react'
import { DownloadCloud, RefreshCw, AlertTriangle } from 'lucide-react'
import { electronApi } from '@/lib/electron'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import type { UpdateState } from '@/types'

export function UpdateBadge() {
  const t = useT()
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    if (!electronApi) return
    electronApi.updater.getState().then(setState)
    return electronApi.updater.onStatus(setState)
  }, [])

  if (state.status === 'downloaded') {
    return (
      <Button size="sm" variant="success" onClick={() => electronApi?.updater.install()}>
        <RefreshCw className="h-3.5 w-3.5" />
        {t('titlebar.update.restart')}
      </Button>
    )
  }

  if (state.status === 'downloading') {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={t('titlebar.update.downloading', { percent: state.percent ?? 0 })}
        className="flex items-center gap-1.5 rounded-full border border-[var(--neon-1)]/25 bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground"
      >
        <DownloadCloud aria-hidden className="h-3.5 w-3.5 animate-pulse text-[var(--neon-1)]" />
        <span className="numeric text-[var(--neon-1)]">{state.percent ?? 0}%</span>
      </span>
    )
  }

  if (state.status === 'error') {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={() => electronApi?.updater.check()}
        title={state.message}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {t('titlebar.update.failed')}
      </Button>
    )
  }

  return null
}
