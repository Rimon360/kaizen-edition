import { useState } from 'react'
import { Settings2, Smartphone, Monitor, Upload, Volume2, FileAudio, Captions, Mic, Music2, ChevronDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { SectionHeading } from '@/components/common/SectionHeading'
import { TranscribeOptions } from '@/components/common/TranscribeOptions'
import { FilePill } from '@/components/common/FilePill'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ColorInput } from '@/components/ui/color-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils/cn'
import { truncateMiddle } from '@/utils/format'
import { electronApi } from '@/lib/electron'
import { useConfigStore } from '@/store/configStore'
import { useVoiceStore } from '@/store/voiceStore'
import { useT } from '@/i18n'
import { useTranscription } from '@/hooks/useTranscription'
import { FONT_FAMILIES, SUBTITLE_POSITIONS, SUBTITLE_STYLES } from './constants'
import { TranscribeModal } from './TranscribeModal'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-foreground/70">{label}</span>
      {children}
    </div>
  )
}

/**
 * The single selection language across the panel — used for the Format toggle and
 * the Extras checkbox rows so they read as one system. Rest: quiet hairline plate.
 * Hover: cyan edge + faint halo. Selected: solid cyan edge, cyan wash, a 2px top
 * neon accent bar, the .glow-sm halo, and a check tick in the corner.
 */
function OptionTile({
  selected,
  onClick,
  className,
  children,
  ...rest
}: {
  selected: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'no-drag group relative overflow-hidden rounded-[var(--radius)] border p-3 text-left transition-all duration-200 active:scale-[0.985]',
        selected
          ? 'glow glow-sm [--glow:var(--neon-1)] border-[var(--neon-1)] bg-[var(--neon-1)]/8'
          : 'border-white/8 bg-white/[0.02] hover:border-[var(--neon-1)]/35 hover:bg-[var(--neon-1)]/[0.04]',
        className,
      )}
      {...rest}
    >
      {/* 2px top neon accent bar — only on the selected tile */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--neon-1),transparent)] transition-opacity duration-200',
          selected ? 'opacity-100' : 'opacity-0',
        )}
      />
      {children}
      {/* check tick */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-[var(--neon-1)] text-[var(--background)] transition-all duration-200',
          selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        )}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </span>
    </button>
  )
}

/** A config section whose body collapses, so all section headers stay visible and
 *  nothing feels cut off below the scroll. `headerExtra` sits to the right of the
 *  title (e.g. the Subtitles enable switch) and doesn't toggle the collapse.
 *
 *  Controlled (`open` + `onOpenChange`) so the panel can run them as an ACCORDION —
 *  only one section open at a time — which keeps the body short enough to fit without
 *  a scrollbar. Falls back to its own state when used uncontrolled. */
function CollapsibleSection({
  title,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  headerExtra,
  children,
}: {
  title: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = openProp ?? internalOpen
  const handleChange = (o: boolean) => {
    setInternalOpen(o)
    onOpenChange?.(o)
  }
  return (
    <Collapsible
      open={open}
      onOpenChange={handleChange}
      className="border-t border-border/40 pt-4 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="no-drag group -ml-1 flex flex-1 items-center gap-2 rounded-[var(--radius)] px-1 py-1 text-left">
          {/* leading neon tick — brightens when the section is open */}
          <span
            aria-hidden
            className={cn(
              'h-3 w-[3px] shrink-0 rounded-full bg-[var(--neon-1)] transition-opacity duration-200',
              open ? 'opacity-100 glow glow-sm [--glow:var(--neon-1)]' : 'opacity-40 group-hover:opacity-70',
            )}
          />
          <span
            className={cn(
              'display text-[11px] uppercase tracking-[0.16em] transition-colors',
              open ? 'text-foreground/80' : 'text-foreground/55 group-hover:text-foreground/75',
            )}
          >
            {title}
          </span>
          <ChevronDown
            className={cn(
              'ml-0.5 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        {headerExtra}
      </div>
      <CollapsibleContent className="collapsible-content overflow-hidden">
        <div className="space-y-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ConfigPanel() {
  const t = useT()
  const subtitle = useConfigStore((s) => s.subtitle)
  const format = useConfigStore((s) => s.format)
  const extras = useConfigStore((s) => s.extras)
  const voiceOverFile = useConfigStore((s) => s.voiceOverFile)
  const musicFile = useConfigStore((s) => s.musicFile)
  const setSubtitle = useConfigStore((s) => s.setSubtitle)
  const setFormat = useConfigStore((s) => s.setFormat)
  const setExtras = useConfigStore((s) => s.setExtras)
  const setVoiceOverFile = useConfigStore((s) => s.setVoiceOverFile)
  const setMusicFile = useConfigStore((s) => s.setMusicFile)
  const setNarrationPath = useVoiceStore((s) => s.setNarrationPath)
  const transcribing = useVoiceStore((s) => s.transcribing)
  const clearTranscript = useVoiceStore((s) => s.clearTranscript)
  const setText = useVoiceStore((s) => s.setText)
  const transcriptText = useVoiceStore((s) => s.transcriptText)
  const setUseVideoAudio = useVoiceStore((s) => s.setUseVideoAudio)
  // The blocking modal's live state lives in the store so a run triggered from the
  // Voice panel ("Transcribe from video") drives this same modal. The worker reports
  // a REAL percent/ETA for every phase, so we just show what it reports.
  const partialText = useVoiceStore((s) => s.transcribePartial)
  const canceling = useVoiceStore((s) => s.transcribeCanceling)
  const { transcribe, cancel: cancelTranscribe } = useTranscription()

  // Last-applied subtitle style (just for the dropdown's display; the look itself
  // lives in the merged subtitle config).
  const [styleId, setStyleId] = useState('')

  // Accordion: exactly one config section open at a time. Keeping the others
  // collapsed makes the body short enough to fit without a scrollbar, while every
  // setting stays one click away. '' = all collapsed.
  const [openSection, setOpenSection] = useState('subtitles')
  const sectionProps = (id: string) => ({
    open: openSection === id,
    onOpenChange: (o: boolean) => setOpenSection(o ? id : ''),
  })

  // Offline speech-to-text for an uploaded audio file. The full orchestration
  // (progress, cancel, result handling) lives in the shared useTranscription hook,
  // so the Voice panel's "Transcribe from video" button reuses the exact same flow.
  const transcribeFile = (path: string) => transcribe(path)

  const handleUploadVoice = async () => {
    if (!electronApi) return toast.error(t('common.desktopOnly'))
    const res = await electronApi.dialog.openAudio()
    if (!res.canceled && res.paths[0]) {
      // A new audio file invalidates the previous script/transcript. We do NOT
      // auto-transcribe — the user starts it explicitly with the Transcribe button
      // (so they're never confused by a silent background extraction).
      setText('')
      setVoiceOverFile(res.paths[0])
      setNarrationPath(res.paths[0])
      // Uploading an audio voice-over means "use this", so clear any prior choice to
      // use the video's own audio.
      setUseVideoAudio(false)
      toast.success(t('config.voiceOverLoaded'))
    }
  }

  const handleUploadMusic = async () => {
    if (!electronApi) return toast.error(t('common.desktopOnly'))
    const res = await electronApi.dialog.openAudio()
    if (!res.canceled && res.paths[0]) {
      setMusicFile(res.paths[0])
      toast.success(t('config.musicLoaded'))
    }
  }

  // Values for the blocking transcription modal (download → load → live preview).
  // The worker reports a real percent for every phase now, so we just show it.
  const shownTranscribePct = transcribing?.percent ?? 0
  const transcribeLabel = transcribing
    ? transcribing.phase === 'downloading'
      ? t('config.transcribeDownloading', { n: transcribing.percent })
      : transcribing.phase === 'loading'
        ? t('config.transcribeLoading')
        : t('config.transcribingPct', { n: shownTranscribePct })
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-5 pb-3">
        <SectionHeading
          title={t('config.title')}
          subtitle={t('config.subtitle')}
          icon={<Settings2 className="h-5 w-5" />}
        />
      </div>

      {/* With the accordion only one section is open, so this normally fits without
          scrolling. If a single tall section ever exceeds the cap it stays wheel-
          scrollable, but the bar is hidden — the panel never shows a scrollbar while
          every setting stays reachable. */}
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="pb-5">
          {/* Subtitles */}
          <CollapsibleSection
            title={t('config.subtitles')}
            {...sectionProps('subtitles')}
            headerExtra={
              <Switch
                checked={subtitle.enabled}
                onCheckedChange={(v) => setSubtitle({ enabled: v })}
              />
            }
          >
            <fieldset
              disabled={!subtitle.enabled}
              className="min-w-0 space-y-3 rounded-[var(--radius)] border border-white/8 bg-black/15 p-3 transition-opacity disabled:pointer-events-none disabled:opacity-40"
            >
              {/* Headline feature — futuristic caption looks as a swatch grid. Each
                  preset is a mini caption chip on a dark plate, rendered in its REAL
                  color / stroke / glow / font, so the pick is a true preview. */}
              <div className="space-y-2">
                <span className="display text-[11px] uppercase tracking-[0.16em] text-foreground/55">
                  {t('config.subtitleStyle')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTITLE_STYLES.map((st) => {
                    const active = styleId === st.id
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setStyleId(st.id)
                          setSubtitle(st.subtitle)
                        }}
                        aria-pressed={active}
                        aria-label={st.name}
                        className={cn(
                          'no-drag group relative grid h-[58px] place-items-center overflow-hidden rounded-[var(--radius)] border px-2 transition-all duration-200 active:scale-[0.985]',
                          // dark plate so the neon caption pops, same surface in all states
                          'bg-[radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--neon-1)_8%,#05070b),#04060a)]',
                          active
                            ? 'glow glow-sm [--glow:var(--neon-1)] border-[var(--neon-1)]'
                            : 'border-white/8 hover:border-[var(--neon-1)]/40',
                        )}
                      >
                        {/* the caption preview — real color / stroke / glow / font */}
                        <span
                          className="truncate text-[15px] font-bold leading-none"
                          style={{
                            color: st.subtitle.color,
                            fontFamily: st.subtitle.fontFamily,
                            WebkitTextStroke: st.subtitle.stroke
                              ? `${Math.min(1.4, (st.subtitle.strokeWidth ?? 2) / 2.5)}px ${st.subtitle.strokeColor}`
                              : undefined,
                            textShadow: st.subtitle.glow
                              ? `0 0 ${Math.min(12, st.subtitle.glow)}px ${st.subtitle.strokeColor ?? st.subtitle.color}`
                              : undefined,
                          }}
                        >
                          {st.name}
                        </span>
                        {st.isNew && (
                          <span className="neon-gradient-text absolute left-1.5 top-1.5 font-mono text-[8px] font-bold uppercase leading-none tracking-[0.12em]">
                            {t('common.new')}
                          </span>
                        )}
                        {/* selected check tick */}
                        <span
                          aria-hidden
                          className={cn(
                            'pointer-events-none absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--neon-1)] text-[var(--background)] transition-all duration-200',
                            active ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
                          )}
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <Row label={t('config.position')}>
                <Select
                  value={subtitle.position}
                  onValueChange={(v) => setSubtitle({ position: v as typeof subtitle.position })}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTITLE_POSITIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {t('config.pos.' + p.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-foreground/70">{t('config.size')}</span>
                  <span className="numeric text-xs text-[var(--neon-1)]">{subtitle.fontSize}px</span>
                </div>
                <Slider
                  min={24}
                  max={160}
                  step={1}
                  disabled={!subtitle.enabled}
                  value={[subtitle.fontSize]}
                  onValueChange={([v]) => setSubtitle({ fontSize: v })}
                />
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">{t('config.sizeHint')}</p>
              </div>

              <Row label={t('config.font')}>
                <Select
                  value={subtitle.fontFamily}
                  onValueChange={(v) => setSubtitle({ fontFamily: v })}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((f) => (
                      <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row label={t('config.textColor')}>
                <ColorInput
                  label={t('config.textColor')}
                  value={subtitle.color}
                  onChange={(v) => setSubtitle({ color: v })}
                  className="w-32"
                />
              </Row>

              <div className="space-y-2">
                <Row label={t('config.background')}>
                  <Switch
                    checked={subtitle.backgroundEnabled}
                    onCheckedChange={(v) => setSubtitle({ backgroundEnabled: v })}
                  />
                </Row>
                {subtitle.backgroundEnabled && (
                  <ColorInput
                    label={t('config.background')}
                    value={subtitle.backgroundColor}
                    onChange={(v) => setSubtitle({ backgroundColor: v })}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Row label={t('config.strokeOutline')}>
                  <Switch
                    checked={subtitle.stroke}
                    onCheckedChange={(v) => setSubtitle({ stroke: v })}
                  />
                </Row>
                {subtitle.stroke && (
                  <div className="flex items-center gap-2">
                    <ColorInput
                      label={t('config.strokeOutline')}
                      value={subtitle.strokeColor}
                      onChange={(v) => setSubtitle({ strokeColor: v })}
                      className="flex-1"
                    />
                    <div className="flex w-28 items-center gap-2">
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        disabled={!subtitle.enabled}
                        value={[subtitle.strokeWidth]}
                        onValueChange={([v]) => setSubtitle({ strokeWidth: v })}
                      />
                      <span className="numeric w-4 text-xs text-[var(--neon-1)]">
                        {subtitle.strokeWidth}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Karaoke word highlight — a colored rounded pill behind the word being
                  spoken, synced to the transcript. Most accurate with a transcribed clip. */}
              <div className="space-y-2">
                <Row label={t('config.wordHighlight')}>
                  <Switch
                    checked={subtitle.wordHighlightEnabled}
                    onCheckedChange={(v) => setSubtitle({ wordHighlightEnabled: v })}
                  />
                </Row>
                {subtitle.wordHighlightEnabled && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] italic leading-snug text-muted-foreground">
                      {t('config.wordHighlightHint')}
                    </p>
                    {/* Style toggle: a phrase block vs. one word at a time. */}
                    <div className="space-y-1.5">
                      <span className="text-sm text-foreground/80">{t('config.highlightMode')}</span>
                      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-black/20 p-1">
                        {(
                          [
                            { value: 'line', label: t('config.highlightModeLine') },
                            { value: 'word', label: t('config.highlightModeWord') },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setSubtitle({ wordHighlightMode: o.value })}
                            aria-pressed={subtitle.wordHighlightMode === o.value}
                            className={cn(
                              'no-drag rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                              subtitle.wordHighlightMode === o.value
                                ? 'glow [--glow-opacity:0.22] bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Row label={t('config.highlightColor')}>
                      <ColorInput
                        label={t('config.highlightColor')}
                        value={subtitle.wordHighlightColor}
                        onChange={(v) => setSubtitle({ wordHighlightColor: v })}
                        className="w-32"
                      />
                    </Row>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground/80">
                          {t('config.highlightRadius')}
                        </span>
                        <span className="numeric text-xs text-[var(--neon-1)]">
                          {subtitle.wordHighlightRadius}px
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={40}
                        step={1}
                        disabled={!subtitle.enabled}
                        value={[subtitle.wordHighlightRadius]}
                        onValueChange={([v]) => setSubtitle({ wordHighlightRadius: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </fieldset>
          </CollapsibleSection>

          {/* Format */}
          <CollapsibleSection title={t('config.format')} {...sectionProps('format')}>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'vertical', label: t('config.vertical'), ratio: '9:16', icon: Smartphone },
                  { value: 'horizontal', label: t('config.horizontal'), ratio: '16:9', icon: Monitor },
                ] as const
              ).map((f) => (
                <OptionTile
                  key={f.value}
                  selected={format === f.value}
                  onClick={() => setFormat(f.value)}
                  aria-label={t('config.formatAria', { label: f.label, ratio: f.ratio })}
                  className="flex flex-col items-center gap-1.5"
                >
                  <f.icon
                    className={cn(
                      'h-6 w-6 transition-colors',
                      format === f.value ? 'text-[var(--neon-1)]' : 'text-muted-foreground',
                    )}
                  />
                  <span className="text-[13px] font-medium text-foreground/90">{f.label}</span>
                  <span className="numeric text-[11px] text-[var(--neon-1)]">{f.ratio}</span>
                </OptionTile>
              ))}
            </div>
          </CollapsibleSection>

          {/* Extras */}
          <CollapsibleSection title={t('config.extras')} {...sectionProps('extras')}>
            <div className="space-y-2.5">
              {(
                [
                  { key: 'voiceOver', label: t('config.voiceOver'), icon: Mic },
                  { key: 'soundEffects', label: t('config.soundEffects'), icon: Music2 },
                  { key: 'normalizeAudio', label: t('config.normalizeAudio'), icon: Volume2 },
                ] as const
              ).map((e) => (
                <label
                  key={e.key}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-[var(--radius)] border p-2.5 transition-all duration-200',
                    extras[e.key]
                      ? 'glow glow-sm [--glow:var(--neon-1)] border-[var(--neon-1)] bg-[var(--neon-1)]/8'
                      : 'border-white/8 bg-white/[0.02] hover:border-[var(--neon-1)]/35 hover:bg-[var(--neon-1)]/[0.04]',
                  )}
                >
                  {/* 2px top neon accent bar when selected — same language as the tiles */}
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--neon-1),transparent)] transition-opacity duration-200',
                      extras[e.key] ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <Checkbox
                    checked={extras[e.key]}
                    onCheckedChange={(v) => setExtras({ [e.key]: !!v })}
                  />
                  <e.icon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      extras[e.key] ? 'text-[var(--neon-1)]' : 'text-muted-foreground',
                    )}
                  />
                  <span className="text-[13px] text-foreground/90">{e.label}</span>
                </label>
              ))}
            </div>

            {/* Sound effects → upload a background music track to mix under the audio. */}
            {extras.soundEffects && (
              <div className="mt-2.5 space-y-2 rounded-[var(--radius)] border border-white/8 bg-black/15 p-2.5">
                <Button variant="secondary" size="sm" className="w-full" onClick={handleUploadMusic}>
                  <Music2 className="h-3.5 w-3.5" />
                  {t('config.uploadMusic')}
                </Button>
                {musicFile ? (
                  <FilePill
                    icon={Music2}
                    tone="success"
                    name={truncateMiddle(musicFile.split(/[\\/]/).pop() ?? '', 26)}
                    onRemove={() => setMusicFile(null)}
                    removeLabel={t('config.removeMusic')}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t('config.musicNotLoaded')}</p>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Voice-over upload */}
          <CollapsibleSection title={t('config.uploadVoiceOver')} {...sectionProps('voiceOver')}>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleUploadVoice}
              disabled={!!transcribing}
            >
              <Upload className="h-4 w-4" />
              {t('config.upload')}
            </Button>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
              {t('config.allowedFormats')}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Captions className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              {t('config.transcribeHint')}
            </p>
            {voiceOverFile ? (
              <FilePill
                icon={FileAudio}
                tone="success"
                name={truncateMiddle(voiceOverFile.split(/[\\/]/).pop() ?? '', 28)}
                onRemove={() => {
                  setVoiceOverFile(null)
                  setNarrationPath(null)
                  setText('')
                  clearTranscript()
                }}
                removeLabel={t('config.removeVoiceOver')}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t('config.voiceOverNotLoaded')}</p>
            )}
            {/* Source language + translate-to-English, shown with a loaded file. */}
            {voiceOverFile && !transcribing && <TranscribeOptions />}
            {/* No auto-transcribe: the user starts it explicitly. Progress shows
                in a blocking modal so export can't happen mid-transcription. */}
            {voiceOverFile &&
              !transcribing &&
              (transcriptText ? (
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--neon-1)]/30 bg-[var(--neon-1)]/[0.06] px-2.5 py-1.5 text-xs text-[var(--neon-1)]">
                  <Captions className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t('config.transcribeDone')}</span>
                  <button
                    type="button"
                    className="no-drag shrink-0 rounded-full px-1 text-[11px] uppercase tracking-[0.1em] underline-offset-2 transition-colors hover:text-[var(--neon-3)] hover:underline"
                    onClick={() => void transcribeFile(voiceOverFile)}
                  >
                    {t('config.retranscribe')}
                  </button>
                </div>
              ) : (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => void transcribeFile(voiceOverFile)}
                >
                  <Captions className="h-4 w-4" />
                  {t('config.transcribeButton')}
                </Button>
              ))}
          </CollapsibleSection>
        </div>
      </div>

      <TranscribeModal
        open={!!transcribing}
        phase={transcribing?.phase ?? 'transcribing'}
        percent={shownTranscribePct}
        etaSec={transcribing?.etaSec}
        label={transcribeLabel}
        partialText={partialText}
        canceling={canceling}
        onCancel={cancelTranscribe}
      />
    </div>
  )
}
