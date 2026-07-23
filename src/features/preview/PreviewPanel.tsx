import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye, Film } from 'lucide-react'
import { SectionHeading } from '@/components/common/SectionHeading'
import { cn } from '@/utils/cn'
import { electronApi } from '@/lib/electron'
import { useQueueStore } from '@/store/queueStore'
import { useConfigStore } from '@/store/configStore'
import { useVoiceStore } from '@/store/voiceStore'
import { useT } from '@/i18n'

export function PreviewPanel() {
  const t = useT()
  const firstClip = useQueueStore((s) => s.items[0])
  const format = useConfigStore((s) => s.format)
  const subtitle = useConfigStore((s) => s.subtitle)
  const voiceText = useVoiceStore((s) => s.text)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const isVertical = format === 'vertical'
  const [box, setBox] = useState({ width: 0, height: 0 })

  // Size the frame to CONTAIN the chosen aspect ratio within the available area —
  // computed exactly for every viewport + format, so the preview never overflows
  // (the old cutout) nor distorts, regardless of whether width or height is the
  // limiting dimension. useLayoutEffect measures before paint to avoid a flash.
  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const arW = isVertical ? 9 : 16
    const arH = isVertical ? 16 : 9
    const measure = () => {
      const W = el.clientWidth
      const H = el.clientHeight
      if (!W || !H) return
      const width = Math.floor(Math.min(W, (H * arW) / arH))
      setBox({ width, height: Math.floor((width * arH) / arW) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isVertical])

  const targetWidth = isVertical ? 1080 : 1920
  const scale = box.width / targetWidth
  // The renderer only burns subtitles when there is narration text, so mirror that
  // here: with text we preview the real caption; without it we show a clearly-marked
  // placeholder so the user knows nothing will be burned yet.
  const hasText = voiceText.trim().length > 0
  const previewText = hasText
    ? voiceText.trim().split(/\s+/).slice(0, 6).join(' ')
    : t('preview.subtitle.example')
  const previewWords = previewText.split(/\s+/).filter(Boolean)

  // Karaoke preview: cycle the "spoken" word so the user sees the highlight pill move.
  // The exported video uses REAL per-word transcript timing; this is just a WYSIWYG
  // demo of the look (color + radius), so a steady interval is fine.
  const karaoke = subtitle.enabled && subtitle.wordHighlightEnabled && hasText
  const [activeWord, setActiveWord] = useState(0)
  useEffect(() => {
    if (!karaoke || previewWords.length === 0) return
    setActiveWord(0)
    const id = setInterval(
      () => setActiveWord((i) => (i + 1) % previewWords.length),
      550,
    )
    return () => clearInterval(id)
  }, [karaoke, previewWords.length])

  const videoSrc = firstClip && electronApi ? electronApi.shell.toMediaUrl(firstClip.path) : null

  const subtitleStyle: React.CSSProperties = {
    fontFamily: subtitle.fontFamily,
    fontSize: Math.max(10, subtitle.fontSize * scale),
    color: subtitle.color,
    fontWeight: 800,
    lineHeight: 1.1,
    padding: subtitle.backgroundEnabled ? '0.1em 0.4em' : 0,
    background: subtitle.backgroundEnabled ? subtitle.backgroundColor : 'transparent',
    WebkitTextStroke: subtitle.stroke
      ? `${Math.max(0.5, subtitle.strokeWidth * scale)}px ${subtitle.strokeColor}`
      : undefined,
    // Neon glow preview — mirrors the ASS \blur so the futuristic styles look WYSIWYG.
    textShadow:
      subtitle.glow && subtitle.glow > 0
        ? `0 0 ${Math.max(2, subtitle.glow * scale * 1.6)}px ${subtitle.strokeColor}, 0 0 ${Math.max(5, subtitle.glow * scale * 3.4)}px ${subtitle.strokeColor}`
        : undefined,
    paintOrder: 'stroke fill',
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-5 pb-3">
        <SectionHeading title={t('preview.title')} icon={<Eye className="h-5 w-5" />} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-5 pb-5">
        {/* Centering wrapper measured by the ResizeObserver; the frame is sized in
            JS to "contain" the aspect ratio within it (narration row stacks below). */}
        <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="scanline glow glow-sm relative overflow-hidden rounded-[var(--radius)] border border-[var(--neon-1)]/40 bg-black [--glow:linear-gradient(135deg,var(--neon-1),var(--neon-2))]"
            style={{ width: box.width || undefined, height: box.height || undefined }}
          >
          {/* Faint radial inner vignette so the canvas reads like a real monitor */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'radial-gradient(120% 100% at 50% 50%, transparent 55%, color-mix(in oklab, #000 55%, transparent) 100%)',
            }}
          />
          {/* Corner-bracket HUD ticks */}
          <span aria-hidden className="pointer-events-none absolute left-1.5 top-1.5 z-[2] h-3 w-3 border-l border-t border-[var(--neon-1)]/50" />
          <span aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 z-[2] h-3 w-3 border-r border-t border-[var(--neon-1)]/50" />
          <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 z-[2] h-3 w-3 border-b border-l border-[var(--neon-1)]/50" />
          <span aria-hidden className="pointer-events-none absolute bottom-1.5 right-1.5 z-[2] h-3 w-3 border-b border-r border-[var(--neon-1)]/50" />

          <span className="hud-chip numeric absolute left-2 top-2 z-[3] px-1.5 py-0.5">
            {isVertical ? '9:16' : '16:9'}
          </span>

          {videoSrc ? (
            <video
              key={videoSrc}
              src={videoSrc}
              controls
              className="relative z-[2] h-full w-full object-contain"
            />
          ) : subtitle.enabled ? (
            // Subtitles on but no clip yet → show only the caption preview on the
            // empty frame (the "no clips" placeholder would overlap it).
            null
          ) : (
            <div className="relative z-[2] flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center text-muted-foreground">
              <Film className="mb-0.5 h-8 w-8 text-[var(--neon-1)]/40" />
              <span className="display text-[11px] uppercase tracking-[0.16em] text-foreground/55">{t('preview.empty.title')}</span>
              <span className="text-xs text-muted-foreground/70">
                {t('preview.empty.hint')}
              </span>
            </div>
          )}

          {subtitle.enabled && (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 z-[3] flex flex-col items-center gap-1 px-3 text-center',
                subtitle.position === 'top' && 'top-[6%]',
                subtitle.position === 'upperMiddle' && 'top-[28%]',
                subtitle.position === 'middle' && 'top-1/2 -translate-y-1/2',
                subtitle.position === 'lowerMiddle' && 'bottom-[28%]',
                subtitle.position === 'bottom' && 'bottom-[6%]',
              )}
            >
              {karaoke ? (
                subtitle.wordHighlightMode === 'word' ? (
                  // One word at a time, centered in a pill — mirrors the export.
                  <span
                    style={{
                      ...subtitleStyle,
                      background: subtitle.wordHighlightColor,
                      padding: '0.08em 0.34em',
                      borderRadius: Math.max(2, subtitle.wordHighlightRadius * scale),
                    }}
                  >
                    {previewWords[activeWord] ?? previewWords[0] ?? ''}
                  </span>
                ) : (
                  // A phrase line with a pill on the word being spoken — mirrors the
                  // export (a block of words, the current word highlighted).
                  <span
                    style={subtitleStyle}
                    className="flex flex-wrap items-center justify-center gap-x-[0.18em] gap-y-1"
                  >
                    {previewWords.map((w, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '0.05em 0.28em',
                          borderRadius: Math.max(2, subtitle.wordHighlightRadius * scale),
                          background: i === activeWord ? subtitle.wordHighlightColor : 'transparent',
                          transition: 'background-color 140ms ease-out',
                        }}
                      >
                        {w}
                      </span>
                    ))}
                  </span>
                )
              ) : (
                <span style={subtitleStyle} className={cn(!hasText && 'opacity-60')}>
                  {previewText}
                </span>
              )}
              {!hasText && (
                <span className="hud-chip px-1.5 py-0.5 text-[9px]">
                  {t('preview.subtitle.placeholder')}
                </span>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
