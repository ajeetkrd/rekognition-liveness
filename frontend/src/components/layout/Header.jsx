// Canonical Header — 3 columns (links | title | switcher+portal), inline
// styles only (no Tailwind dependency), framer-motion entry animation.
//
// SHARED MODULE — copied verbatim into each demo's frontend/src/components/layout/.
// Canonical source: demos/_shared-frontend/components/layout/Header.jsx
// Sync via: demos/_shared-frontend/sync-shared.sh
//
// USAGE — each demo passes its own samples/docs URLs as props:
//
//   <Header
//     samplesUrl="https://github.com/aws-samples/..."
//     docsUrl="https://docs.aws.amazon.com/bedrock/..."
//   />
//
// The eyebrow, title, and portal-button label are read from i18n keys
// `header.eyebrow`, `header.title`, `header.refSamples`, `header.refDocs`,
// `header.portal` — each demo provides those in its locales/{en,pt,es}.js.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useT } from '../../i18n/I18nContext.jsx'
import LanguageSwitcher from '../ui/LanguageSwitcher.jsx'
import { portalReturnUrl } from '../../services/portalReturn.js'
import HowItWorksModal from '../HowItWorksModal.jsx'

export default function Header({ samplesUrl, docsUrl }) {
  const { t } = useT()
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: '2px solid var(--neon-cyan)',
        boxShadow: '0 0 24px rgba(0, 240, 255, 0.18)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 16,
          maxWidth: 1920,
          marginInline: 'auto',
          padding: '12px 24px',
        }}
      >
        {/* Left: external resource links */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexShrink: 0,
          }}
        >
          {samplesUrl && (
            <a
              href={samplesUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <span style={{ fontSize: 14 }}>📦</span>
              {t('header.refSamples')}
            </a>
          )}
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <span style={{ fontSize: 14 }}>📖</span>
              {t('header.refDocs')}
            </a>
          )}
        </div>

        {/* Center: title — flex-grows, allowed to wrap to 2 lines */}
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            textAlign: 'center',
            paddingInline: 8,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 10,
              color: 'var(--neon-cyan)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              marginBottom: 2,
              opacity: 0.85,
            }}
          >
            {t('header.eyebrow')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#fff',
                textShadow: '0 0 12px var(--neon-cyan)',
                margin: 0,
                lineHeight: 1.15,
                wordBreak: 'break-word',
              }}
            >
              {t('header.title')}
            </h1>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label={t('howItWorks.button')}
              title={t('howItWorks.button')}
              style={{
                flexShrink: 0,
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: '1px solid var(--neon-cyan)',
                background: 'rgba(0, 240, 255, 0.1)',
                color: 'var(--neon-cyan)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ?
            </button>
          </div>
        </div>
        {helpOpen && <HowItWorksModal onClose={() => setHelpOpen(false)} />}

        {/* Right: language switcher + portal link */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <LanguageSwitcher />
          <a
            href={portalReturnUrl()}
            style={{
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid var(--neon-cyan)',
              borderRadius: 6,
              color: 'var(--neon-cyan)',
              fontSize: 12,
              padding: '8px 14px',
              textDecoration: 'none',
              fontWeight: 600,
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}
          >
            {t('header.portal')}
          </a>
        </div>
      </div>
    </motion.header>
  )
}

const linkStyle = {
  color: 'var(--neon-cyan)',
  fontSize: 12,
  textDecoration: 'none',
  borderBottom: '1px solid var(--neon-cyan)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  transition: 'all 0.2s',
  whiteSpace: 'nowrap',
}
