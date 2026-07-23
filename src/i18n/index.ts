import { useSettingsStore } from '@/store/settingsStore'
import { translations } from './translations'
import type { Lang } from './types'

export { LANGUAGES } from './types'
export type { Lang } from './types'

function format(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str
  return Object.keys(vars).reduce((s, k) => s.split(`{${k}}`).join(String(vars[k])), str)
}

/** Translate a key in a given language (es fallback, then the key itself). */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const str = translations[lang]?.[key] ?? translations.es[key] ?? key
  return format(str, vars)
}

/** Reactive translator for React components — re-renders on language change. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useSettingsStore((s) => s.settings.language)
  return (key, vars) => translate(lang, key, vars)
}

/** Imperative translator for stores / services (outside React). */
export function tx(key: string, vars?: Record<string, string | number>): string {
  const lang = useSettingsStore.getState().settings.language
  return translate(lang, key, vars)
}
