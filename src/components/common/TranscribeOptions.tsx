import { Languages } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettingsStore } from '@/store/settingsStore'
import { useT } from '@/i18n'
import type { TranscribeLanguage } from '@/types'

/**
 * Per-transcription controls shared by the audio-file transcribe (ConfigPanel) and
 * the video transcribe (VoicePanel): the SOURCE language + a "translate to English"
 * toggle. Both bind to the global app settings (the same `transcribeLanguage` the
 * Settings page exposes), so changing one place reflects everywhere and the choice
 * persists. Whisper's translate task targets English only — see the hint.
 */
export function TranscribeOptions({ disabled = false }: { disabled?: boolean }) {
  const t = useT()
  const language = useSettingsStore((s) => s.settings.transcribeLanguage)
  const translate = useSettingsStore((s) => s.settings.translateToEnglish)
  const update = useSettingsStore((s) => s.update)

  return (
    <div className="space-y-2.5 rounded-[var(--radius)] border border-border/60 bg-black/15 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] text-foreground/70">
          <Languages className="h-3.5 w-3.5 text-[var(--neon-1)]/70" />
          {t('voice.transcribeLangLabel')}
        </span>
        <Select
          value={language}
          onValueChange={(v) => void update({ transcribeLanguage: v as TranscribeLanguage })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-32" aria-label={t('voice.transcribeLangLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t('voice.transcribeLangAuto')}</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label
        className={`flex items-start gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        title={t('voice.translateHint')}
      >
        <Checkbox
          checked={translate}
          onCheckedChange={(v) => void update({ translateToEnglish: !!v })}
          disabled={disabled}
          className="mt-0.5"
          aria-label={t('voice.translateToEnglish')}
        />
        <span className="flex min-w-0 flex-col">
          <span className="text-[12px] text-foreground/85">{t('voice.translateToEnglish')}</span>
          <span className="text-[10px] leading-snug text-muted-foreground">
            {t('voice.translateHint')}
          </span>
        </span>
      </label>
    </div>
  )
}
