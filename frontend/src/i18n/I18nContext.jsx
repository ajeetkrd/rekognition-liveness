// Tiny i18n context — same shape used by demos/prompt-optimization. No
// external dep. Strings live in `locales/{en,pt,es}.js` as nested objects.
// Looks up via dotted paths with `{var}` placeholder interpolation.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import en from './locales/en.js'
import pt from './locales/pt.js'
import es from './locales/es.js'
import { readLang, writeLang } from './langCookie.js'

const CATALOGS = { en, pt, es }
export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'es', label: 'Español', flag: '🇲🇽' },
]

const I18nContext = createContext(null)

function get(catalog, path) {
  const parts = path.split('.')
  let cur = catalog
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p]
    else return undefined
  }
  return cur
}

function interpolate(template, vars) {
  if (typeof template !== 'string') return template
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
}

export function I18nProvider({ children, initialLang }) {
  const [lang, setLangState] = useState(() => {
    const stored = readLang()
    if (stored && CATALOGS[stored]) return stored
    if (initialLang && CATALOGS[initialLang]) return initialLang
    return 'en'
  })

  useEffect(() => {
    writeLang(lang)
  }, [lang])

  const value = useMemo(() => {
    function t(key, vars) {
      const primary = get(CATALOGS[lang], key)
      if (primary !== undefined) return interpolate(primary, vars)
      const fallback = get(CATALOGS.en, key)
      if (fallback !== undefined) return interpolate(fallback, vars)
      return ''
    }
    return { t, lang, setLang: setLangState }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used inside I18nProvider')
  return ctx
}
