export type Lang = 'es' | 'en'

export type Dict = Record<string, string>

export interface LangPack {
  es: Dict
  en: Dict
}

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]
