import type { EditTemplate, SubtitleConfig, SubtitlePosition, VideoFormat } from '@/types'

export interface TemplateOption {
  value: EditTemplate
  /** English reference label — the dropdown actually renders t('queue.tpl.<value>'). */
  label: string
}

export const TEMPLATES: TemplateOption[] = [
  { value: 'motivational', label: 'Motivational - High Impact' },
  { value: 'youtuber', label: 'Youtuber Clips' },
  { value: 'fastMotion', label: 'Fast Motion' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'education', label: 'Education' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'vlog', label: 'Vlog Style' },
  { value: 'musicVideo', label: 'Music Video' },
  { value: 'gaming', label: 'Gaming Highlights' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'dynamicVertical', label: 'Dynamic Vertical (≤ 60s)' },
  { value: 'narrativeVertical', label: 'Narrative Vertical (> 60s)' },
  { value: 'proHorizontal', label: 'Professional Horizontal (≤ 5 min)' },
  { value: 'extendedHorizontal', label: 'Extended Horizontal (> 5 min)' },
]

/**
 * What each template APPLIES when selected: the video format + a caption style
 * preset (merged over the current subtitle config). Selecting a template is a
 * one-click look — the user can still tweak anything afterwards.
 */
export const TEMPLATE_PRESETS: Record<
  EditTemplate,
  { format: VideoFormat; subtitle: Partial<SubtitleConfig> }
> = {
  // — Vertical / short-form social —
  motivational: {
    format: 'vertical',
    subtitle: { position: 'middle', fontSize: 92, fontFamily: 'Impact', stroke: true, strokeWidth: 5, backgroundEnabled: false },
  },
  youtuber: {
    format: 'vertical',
    subtitle: { position: 'bottom', fontSize: 64, fontFamily: 'Montserrat', stroke: true, strokeWidth: 3, backgroundEnabled: false },
  },
  fastMotion: {
    format: 'vertical',
    subtitle: { position: 'middle', fontSize: 84, fontFamily: 'Bebas Neue', stroke: true, strokeWidth: 4, backgroundEnabled: false },
  },
  entertainment: {
    format: 'vertical',
    subtitle: { position: 'bottom', fontSize: 72, fontFamily: 'Montserrat', stroke: true, strokeWidth: 3, backgroundEnabled: false },
  },
  vlog: {
    format: 'vertical',
    subtitle: { position: 'bottom', fontSize: 60, fontFamily: 'Roboto', stroke: true, strokeWidth: 2, backgroundEnabled: false },
  },
  musicVideo: {
    format: 'vertical',
    subtitle: { position: 'lowerMiddle', fontSize: 78, fontFamily: 'Bebas Neue', stroke: true, strokeWidth: 4, backgroundEnabled: false },
  },
  gaming: {
    format: 'vertical',
    subtitle: { position: 'bottom', fontSize: 66, fontFamily: 'Impact', stroke: true, strokeWidth: 4, backgroundEnabled: false },
  },
  dynamicVertical: {
    format: 'vertical',
    subtitle: { position: 'middle', fontSize: 80, fontFamily: 'Montserrat', stroke: true, strokeWidth: 3, backgroundEnabled: false },
  },
  narrativeVertical: {
    format: 'vertical',
    subtitle: { position: 'bottom', fontSize: 66, fontFamily: 'Inter', stroke: true, strokeWidth: 2, backgroundEnabled: false },
  },
  // — Horizontal / widescreen —
  education: {
    format: 'horizontal',
    subtitle: { position: 'bottom', fontSize: 52, fontFamily: 'Inter', stroke: false, backgroundEnabled: true, backgroundColor: '#000000' },
  },
  cinematic: {
    format: 'horizontal',
    subtitle: { position: 'bottom', fontSize: 46, fontFamily: 'Georgia', stroke: false, backgroundEnabled: false },
  },
  documentary: {
    format: 'horizontal',
    subtitle: { position: 'bottom', fontSize: 48, fontFamily: 'Georgia', stroke: false, backgroundEnabled: true, backgroundColor: '#000000' },
  },
  proHorizontal: {
    format: 'horizontal',
    subtitle: { position: 'bottom', fontSize: 50, fontFamily: 'Inter', stroke: true, strokeWidth: 2, backgroundEnabled: false },
  },
  extendedHorizontal: {
    format: 'horizontal',
    subtitle: { position: 'bottom', fontSize: 46, fontFamily: 'Arial', stroke: true, strokeWidth: 2, backgroundEnabled: false },
  },
}

export const FONT_FAMILIES = [
  'Arial',
  'Inter',
  'Impact',
  'Bebas Neue',
  'Montserrat',
  'Roboto',
  'Verdana',
  'Georgia',
  'Times New Roman',
  'Courier New',
]

/**
 * Futuristic, ready-made caption looks. Selecting one merges its color / stroke /
 * neon-glow / font over the current subtitle config (position + size are left alone).
 * The glow renders as an ASS \blur on export and a CSS text-shadow in the preview.
 */
export interface SubtitleStyleOption {
  id: string
  name: string
  /** Shows the "New" badge in the picker. */
  isNew?: boolean
  subtitle: Partial<SubtitleConfig>
}

export const SUBTITLE_STYLES: SubtitleStyleOption[] = [
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    isNew: true,
    subtitle: { color: '#00eaff', stroke: true, strokeColor: '#00eaff', strokeWidth: 2, glow: 9, fontFamily: 'Montserrat', backgroundEnabled: false },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    isNew: true,
    subtitle: { color: '#ff2bd6', stroke: true, strokeColor: '#00eaff', strokeWidth: 3, glow: 8, fontFamily: 'Impact', backgroundEnabled: false },
  },
  {
    id: 'hologram',
    name: 'Hologram',
    isNew: true,
    subtitle: { color: '#cdf6ff', stroke: true, strokeColor: '#3aa0ff', strokeWidth: 2, glow: 11, fontFamily: 'Inter', backgroundEnabled: false },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    isNew: true,
    subtitle: { color: '#ff3d8b', stroke: true, strokeColor: '#7c3aed', strokeWidth: 3, glow: 9, fontFamily: 'Bebas Neue', backgroundEnabled: false },
  },
  {
    id: 'quantum',
    name: 'Quantum',
    isNew: true,
    subtitle: { color: '#ffffff', stroke: true, strokeColor: '#4f7cff', strokeWidth: 2, glow: 9, fontFamily: 'Montserrat', backgroundEnabled: false },
  },
  {
    id: 'plasma',
    name: 'Plasma',
    isNew: true,
    subtitle: { color: '#c4a2ff', stroke: true, strokeColor: '#ff2bd6', strokeWidth: 2, glow: 10, fontFamily: 'Montserrat', backgroundEnabled: false },
  },
  {
    id: 'matrix',
    name: 'Matrix',
    isNew: true,
    subtitle: { color: '#39ff14', stroke: true, strokeColor: '#0aff9d', strokeWidth: 2, glow: 7, fontFamily: 'Courier New', backgroundEnabled: false },
  },
  {
    id: 'laser',
    name: 'Laser',
    isNew: true,
    subtitle: { color: '#ff7a3a', stroke: true, strokeColor: '#ff1e56', strokeWidth: 3, glow: 9, fontFamily: 'Impact', backgroundEnabled: false },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    isNew: true,
    subtitle: { color: '#7df9d0', stroke: true, strokeColor: '#22d3ee', strokeWidth: 2, glow: 9, fontFamily: 'Montserrat', backgroundEnabled: false },
  },
  {
    id: 'starlight',
    name: 'Starlight',
    isNew: true,
    subtitle: { color: '#ffffff', stroke: true, strokeColor: '#60a5fa', strokeWidth: 2, glow: 8, fontFamily: 'Inter', backgroundEnabled: false },
  },
]

export interface SubtitlePositionOption {
  value: SubtitlePosition
  /** English reference label — the dropdown renders t('config.pos.<value>'). */
  label: string
}

export const SUBTITLE_POSITIONS: SubtitlePositionOption[] = [
  { value: 'top', label: 'Top' },
  { value: 'upperMiddle', label: 'Upper middle' },
  { value: 'middle', label: 'Center' },
  { value: 'lowerMiddle', label: 'Lower middle' },
  { value: 'bottom', label: 'Bottom' },
]
