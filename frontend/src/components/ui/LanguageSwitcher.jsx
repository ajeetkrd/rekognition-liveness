// Canonical LanguageSwitcher — pill group with EN / PT / ES.
//
// SHARED MODULE — copied verbatim into each demo's frontend/src/components/ui/.
// Canonical source: demos/_shared-frontend/components/ui/LanguageSwitcher.jsx
// Sync via: demos/_shared-frontend/sync-shared.sh
//
// Selected state mirrors the cyan-glow vibe used elsewhere in the header.
import { SUPPORTED_LANGS, useT } from '../../i18n/I18nContext.jsx'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useT()
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 3,
        borderRadius: 999,
        background: 'rgba(0, 240, 255, 0.06)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
      }}
    >
      {SUPPORTED_LANGS.map((l) => {
        const active = l.code === lang
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            title={l.label}
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              fontFamily: 'var(--font-display)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: active ? 'default' : 'pointer',
              border: 'none',
              background: active ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
              color: active ? 'var(--neon-cyan)' : '#94a3b8',
              boxShadow: active ? '0 0 12px rgba(0, 240, 255, 0.45)' : 'none',
              textShadow: active ? '0 0 6px rgba(0, 240, 255, 0.6)' : 'none',
              transition: 'all 0.15s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = '#94a3b8'
            }}
          >
            <span style={{ fontSize: 13 }}>{l.flag}</span>
            <span>{l.code}</span>
          </button>
        )
      })}
    </div>
  )
}
