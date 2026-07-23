import { useState } from 'react'
import { Mic2, Upload, Trash2, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FilePill } from '@/components/common/FilePill'
import { FieldGroupLabel } from '@/components/common/SectionHeading'
import { electronApi } from '@/lib/electron'
import { truncateMiddle } from '@/utils/format'
import { useCloneStore } from '@/store/cloneStore'
import { useT } from '@/i18n'
import type { CloneVoice } from '@/types'

// Per-voice accent palette — cycles so adjacent saved voices read as distinct.
const VOICE_ACCENTS = ['var(--neon-1)', 'var(--neon-2)', 'var(--neon-3)']

const LANGS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'de', label: 'Deutsch' },
]

export function CloneVoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const voices = useCloneStore((s) => s.voices)
  const status = useCloneStore((s) => s.status)
  const modelStatus = useCloneStore((s) => s.modelStatus)
  const repairModel = useCloneStore((s) => s.repairModel)
  const add = useCloneStore((s) => s.add)
  const remove = useCloneStore((s) => s.remove)

  const [samplePath, setSamplePath] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('es')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  // The voice pending a delete confirmation (centered dialog, not a corner toast).
  const [confirmDel, setConfirmDel] = useState<CloneVoice | null>(null)

  const confirmDelete = async () => {
    if (!confirmDel) return
    const id = confirmDel.id
    setConfirmDel(null)
    await remove(id)
    toast.success(t('clone.removed'))
  }

  const reset = () => {
    setSamplePath(null)
    setName('')
    setConsent(false)
    setSaving(false)
  }

  const pickSample = async () => {
    if (!electronApi) return
    const res = await electronApi.dialog.openAudio()
    if (!res.canceled && res.paths[0]) setSamplePath(res.paths[0])
  }

  const save = async () => {
    if (!samplePath) return toast.error(t('clone.errNoSample'))
    if (!name.trim()) return toast.error(t('clone.errNoName'))
    if (!consent) return toast.error(t('clone.errNoConsent'))
    setSaving(true)
    try {
      const v = await add(samplePath, name, language)
      if (!v) throw new Error(t('clone.errAddFailed'))
      toast.success(t('clone.saved'))
      reset()
    } catch (err) {
      toast.error((err as Error).message || t('clone.errAddFailed'))
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-primary" />
            {t('clone.modal.title')}
          </DialogTitle>
          <DialogDescription>{t('clone.modal.subtitle')}</DialogDescription>
        </DialogHeader>

        {status && !status.available && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('clone.setup.body')}</span>
          </div>
        )}

        {/* Create form */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <FieldGroupLabel>{t('clone.modal.sampleLabel')}</FieldGroupLabel>
            {samplePath ? (
              <div className="flex items-center gap-2">
                <FilePill
                  className="min-w-0 flex-1"
                  tone="success"
                  name={truncateMiddle(samplePath.split(/[\\/]/).pop() ?? '', 28)}
                  meta={t('clone.modal.sampleLoaded')}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={pickSample}
                  aria-label={t('config.upload')}
                  title={t('config.upload')}
                  className="shrink-0"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="w-full" onClick={pickSample}>
                <Upload className="h-4 w-4" />
                {t('clone.modal.uploadSample')}
              </Button>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('clone.modal.tip')}</p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <FieldGroupLabel>{t('clone.modal.nameLabel')}</FieldGroupLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('clone.modal.namePlaceholder')}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <FieldGroupLabel>{t('clone.modal.langLabel')}</FieldGroupLabel>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border border-border/60 bg-black/15 px-2.5 py-2 text-xs leading-relaxed text-foreground/80 transition-colors hover:border-[var(--neon-1)]/30">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
            <span>{t('clone.modal.consent')}</span>
          </label>

          <Button variant="gradient" className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {saving ? t('clone.modal.saving') : t('clone.modal.save')}
          </Button>
        </div>

        {/* Saved voices — each row a mini card with its own neon accent. */}
        {voices.length > 0 && (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-[3px] rounded-full bg-[var(--neon-1)]" />
              <FieldGroupLabel>{t('clone.modal.savedTitle')}</FieldGroupLabel>
            </div>
            {/* Only this list scrolls — a native max-height keeps the modal a
                fixed size no matter how many voices are saved. */}
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {voices.map((v, i) => {
                  const accent = VOICE_ACCENTS[i % VOICE_ACCENTS.length]
                  return (
                    <div
                      key={v.id}
                      className="group/voice flex items-center gap-2.5 rounded-[var(--radius)] border bg-black/20 px-2.5 py-2 transition-colors"
                      style={{ borderColor: `color-mix(in oklab, ${accent} 22%, transparent)` }}
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                        style={{
                          color: accent,
                          background: `color-mix(in oklab, ${accent} 12%, transparent)`,
                        }}
                      >
                        <Mic2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">{v.name}</span>
                      <span
                        className="numeric shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{
                          color: accent,
                          background: `color-mix(in oklab, ${accent} 10%, transparent)`,
                        }}
                      >
                        {v.language}
                      </span>
                      <button
                        aria-label={t('clone.modal.delete')}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-[var(--neon-3)]/15 hover:text-[var(--neon-3)] focus-visible:opacity-100 group-hover/voice:opacity-100"
                        onClick={() => setConfirmDel(v)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Recovery: wipe + re-fetch a clean model if it ever gets corrupted. */}
        {modelStatus?.installed && (
          <button
            type="button"
            onClick={() => {
              onClose()
              void repairModel()
            }}
            className="self-start text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {t('clone.model.repair')}
          </button>
        )}

        <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          {t('clone.disclaimer')}
        </p>
        </DialogContent>
      </Dialog>

      {/* Centered delete confirmation — overlays the manage modal. Cancel returns
          to the current state; Delete removes the voice. */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('clone.modal.deleteConfirm')}
            </DialogTitle>
            <DialogDescription>
              {t('clone.modal.deleteConfirmBody', { name: confirmDel?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>
              {t('clone.modal.deleteCancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" />
              {t('clone.modal.deleteConfirmAction')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
