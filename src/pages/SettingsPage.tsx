import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  FolderOpen,
  RefreshCw,
  SlidersHorizontal,
  Save,
  Mic,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  Languages,
  Loader2,
  X,
  Captions,
  RadioTower,
  Settings2,
  DownloadCloud,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SectionHeading } from '@/components/common/SectionHeading'
import { electronApi } from '@/lib/electron'
import { useSettingsStore } from '@/store/settingsStore'
import { LANGUAGES, useT } from '@/i18n'
import type { TranscribeLanguage, TranscribeModel, TtsProvider } from '@/types'

/** Fixed width for every right-aligned control so all four cards line up. */
const CONTROL_W = '13rem'

/** Card section header: a glowing neon icon chip + display title, over a thin neon top hairline. */
function CardSectionHeader({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <CardHeader className="flex-row items-center gap-3 space-y-0 pb-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] border border-[var(--neon-1)]/25 bg-[var(--neon-1)]/10 text-[var(--neon-1)] glow glow-sm [--glow:var(--neon-1)]">
        <Icon className="h-4 w-4" />
      </span>
      <CardTitle className="display text-[11px] uppercase tracking-[0.16em] text-foreground/70">
        {children}
      </CardTitle>
    </CardHeader>
  )
}

/** A numbered guide step with a small glowing cyan index chip. */
function HelpStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="numeric mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--neon-1)]/30 bg-[var(--neon-1)]/10 text-[10px] font-semibold text-[var(--neon-1)] glow glow-sm [--glow:var(--neon-1)]">
        {n}
      </span>
      <span className="text-[11px] leading-relaxed text-muted-foreground">{children}</span>
    </li>
  )
}

/** One settings row: label on the left, a fixed-width control column on the right. */
function SettingRow({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13px] text-foreground/70">
        {label}
      </Label>
      <div style={{ width: CONTROL_W }}>{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const navigate = useNavigate()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [azureKey, setAzureKey] = useState(settings.azureKey ?? '')
  const [azureRegion, setAzureRegion] = useState(settings.azureRegion ?? '')
  const [showAzureHelp, setShowAzureHelp] = useState(false)
  const [savingAzure, setSavingAzure] = useState(false)

  const openExternal = (url: string) => electronApi?.shell.openExternal(url)

  const saveAzure = async () => {
    if (!azureKey.trim() || !azureRegion.trim()) {
      return toast.error(t('settings.toast.azureMissing'))
    }
    setSavingAzure(true)
    try {
      await update({ azureKey: azureKey.trim(), azureRegion: azureRegion.trim().toLowerCase() })
      toast.success(t('settings.toast.azureSaved'))
    } finally {
      setSavingAzure(false)
    }
  }

  // Check for updates AND surface the result — the titlebar badge only covers the
  // downloading/downloaded states, so "you're up to date" / "error" would otherwise
  // be silent from here.
  const checkUpdates = () => {
    if (!electronApi) return
    toast.info(t('settings.toast.checkingUpdates'))
    let done = false
    const off = electronApi.updater.onStatus((s) => {
      if (done) return
      if (s.status === 'none') {
        done = true
        off()
        toast.success(t('settings.toast.upToDate'))
      } else if (s.status === 'error') {
        done = true
        off()
        toast.error(s.message || t('settings.toast.updateError'))
      } else if (
        s.status === 'available' ||
        s.status === 'downloading' ||
        s.status === 'downloaded'
      ) {
        done = true
        off()
        toast.info(t('settings.toast.updateAvailable'))
      }
    })
    // Stop listening if nothing terminal arrives.
    window.setTimeout(() => {
      if (!done) {
        done = true
        off()
      }
    }, 30000)
    electronApi.updater.check()
  }

  const pickFolder = async () => {
    if (!electronApi) return
    const res = await electronApi.dialog.openDirectory()
    if (!res.canceled && res.paths[0]) update({ exportFolder: res.paths[0] })
  }

  return (
    <div className="h-full overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-xl space-y-6 p-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
            {t('settings.back')}
          </Button>

          <SectionHeading
            title={t('settings.title')}
            subtitle={t('settings.subtitle')}
            align="left"
            icon={<SlidersHorizontal className="h-5 w-5" />}
          />

          {/* Voice engine */}
          <Card>
            <CardSectionHeader icon={RadioTower}>{t('settings.tts.label')}</CardSectionHeader>
            <span aria-hidden className="hairline mx-5" />
            <CardContent className="space-y-4 pt-5">
              <SettingRow label={<><Mic className="h-3.5 w-3.5" /> {t('settings.tts.engine')}</>}>
                <Select
                  value={settings.ttsProvider}
                  onValueChange={(v) => update({ ttsProvider: v as TtsProvider })}
                >
                  <SelectTrigger className="w-full" aria-label={t('settings.tts.engine')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local (Windows)</SelectItem>
                    <SelectItem value="azure">Azure Speech</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              {settings.ttsProvider === 'local' ? (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {t('settings.tts.localHint')}
                </p>
              ) : (
                <div className="space-y-3 rounded-[var(--radius)] border border-border/60 bg-black/20 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="azkey" className="text-[13px] text-foreground/70">{t('settings.tts.azureKey')}</Label>
                    <Input
                      id="azkey"
                      type="password"
                      value={azureKey}
                      onChange={(e) => setAzureKey(e.target.value)}
                      placeholder={t('settings.tts.azureKeyPlaceholder')}
                      className="font-mono text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="azregion" className="text-[13px] text-foreground/70">{t('settings.tts.region')}</Label>
                    <Input
                      id="azregion"
                      value={azureRegion}
                      onChange={(e) => setAzureRegion(e.target.value)}
                      placeholder="eastus"
                      className="text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={saveAzure}
                    disabled={savingAzure}
                  >
                    {savingAzure ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {t('settings.tts.saveAzure')}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.tts.azureHint')}
                  </p>

                  {/* How to get an Azure key — one flat inset guide panel */}
                  <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--neon-1)]/20 bg-[var(--neon-1)]/[0.05]">
                    <button
                      type="button"
                      onClick={() => setShowAzureHelp((v) => !v)}
                      aria-expanded={showAzureHelp}
                      className="no-drag flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--neon-1)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5" />
                        {t('settings.tts.helpToggle')}
                      </span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${showAzureHelp ? 'rotate-180' : ''}`}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {showAzureHelp && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 px-3.5 pb-3.5">
                            <span aria-hidden className="hairline block" />
                            <ol className="space-y-2.5">
                              <HelpStep n={1}>
                                {t('settings.tts.help.step1.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step1.azure')}</strong>{' '}
                                {t('settings.tts.help.step1.post')}
                              </HelpStep>
                              <HelpStep n={2}>
                                {t('settings.tts.help.step2.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step2.resource')}</strong>{' '}
                                {t('settings.tts.help.step2.post')}
                              </HelpStep>
                              <HelpStep n={3}>
                                {t('settings.tts.help.step3.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step3.region')}</strong>{' '}
                                {t('settings.tts.help.step3.mid')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step3.tier')}</strong>{' '}
                                {t('settings.tts.help.step3.post')}
                              </HelpStep>
                              <HelpStep n={4}>
                                {t('settings.tts.help.step4.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step4.keys')}</strong>
                                {t('settings.tts.help.step4.post')}
                              </HelpStep>
                              <HelpStep n={5}>
                                {t('settings.tts.help.step5.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step5.key')}</strong>{' '}
                                {t('settings.tts.help.step5.mid')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.help.step5.location')}</strong>{' '}
                                {t('settings.tts.help.step5.post')}{' '}
                                <code className="numeric rounded bg-black/30 px-1 text-[var(--neon-1)]">eastus</code>
                                {t('settings.tts.help.step5.end')}
                              </HelpStep>
                              <HelpStep n={6}>
                                {t('settings.tts.help.step6.pre')}{' '}
                                <strong className="text-foreground/90">{t('settings.tts.saveAzure')}</strong>
                                {t('settings.tts.help.step6.post')}
                              </HelpStep>
                            </ol>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openExternal(
                                    'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices',
                                  )
                                }
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('settings.tts.help.createResource')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openExternal('https://azure.microsoft.com/free/')}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('settings.tts.help.freeAccount')}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transcription (offline Whisper) — accuracy vs speed/size */}
          <Card>
            <CardSectionHeader icon={Captions}>{t('settings.stt.label')}</CardSectionHeader>
            <span aria-hidden className="hairline mx-5" />
            <CardContent className="space-y-4 pt-5">
              <SettingRow
                htmlFor="stt-model"
                label={<><Captions className="h-3.5 w-3.5" /> {t('settings.stt.model')}</>}
              >
                <Select
                  value={settings.transcribeModel}
                  onValueChange={(v) => update({ transcribeModel: v as TranscribeModel })}
                >
                  <SelectTrigger id="stt-model" className="w-full" aria-label={t('settings.stt.model')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">{t('settings.stt.fast')}</SelectItem>
                    <SelectItem value="accurate">{t('settings.stt.accurate')}</SelectItem>
                    <SelectItem value="best">{t('settings.stt.best')}</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow
                htmlFor="stt-lang"
                label={<><Languages className="h-3.5 w-3.5" /> {t('settings.stt.language')}</>}
              >
                <Select
                  value={settings.transcribeLanguage}
                  onValueChange={(v) => update({ transcribeLanguage: v as TranscribeLanguage })}
                >
                  <SelectTrigger id="stt-lang" className="w-full" aria-label={t('settings.stt.language')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('settings.stt.langAuto')}</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <p className="text-[11px] text-muted-foreground">{t('settings.stt.hint')}</p>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardSectionHeader icon={Settings2}>{t('settings.prefs.label')}</CardSectionHeader>
            <span aria-hidden className="hairline mx-5" />
            <CardContent className="space-y-4 pt-5">
              <SettingRow
                htmlFor="setting-language"
                label={<><Languages className="h-3.5 w-3.5" /> {t('settings.prefs.language')}</>}
              >
                <Select
                  value={settings.language}
                  onValueChange={(v) => update({ language: v as 'es' | 'en' })}
                >
                  <SelectTrigger
                    id="setting-language"
                    className="w-full"
                    aria-label={t('settings.prefs.language')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>

              <div className="space-y-2">
                <Label htmlFor="setting-export-folder" className="flex items-center gap-1.5 text-[13px] text-foreground/70">
                  <FolderOpen className="h-3.5 w-3.5" /> {t('settings.prefs.exportFolder')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="setting-export-folder"
                    readOnly
                    tabIndex={-1}
                    title={settings.exportFolder ?? undefined}
                    value={settings.exportFolder ?? t('settings.prefs.askEachTime')}
                    className="cursor-default text-xs"
                  />
                  {settings.exportFolder && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('settings.prefs.clearFolder')}
                      title={t('settings.prefs.clearFolder')}
                      onClick={() => update({ exportFolder: null })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="secondary" onClick={pickFolder}>
                    {t('settings.prefs.choose')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Updates */}
          <Card>
            <CardSectionHeader icon={DownloadCloud}>{t('settings.updates.label')}</CardSectionHeader>
            <span aria-hidden className="hairline mx-5" />
            <CardContent className="pt-5">
              <Button variant="outline" className="w-full" onClick={checkUpdates}>
                <RefreshCw className="h-4 w-4" />
                {t('settings.updates.check')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
