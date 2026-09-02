import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n/I18nContext.jsx'

// "How it works" — a 4-step wizard:
//   1. Amazon Rekognition — Face Liveness
//   2. Amazon Rekognition — face operations
//   3. Amazon Bedrock — Nova Lite (multimodal)
//   4. Production-in-Brazil mandatory regulatory requirements
// Content from i18n (`howItWorks.*`); reuses the shared `.arch-*` + `.hiw-*` styles.
const SLIDE_ICONS = ['🛡️', '🗂️', '🧠', '⚖️']
const TOTAL = 4

export default function HowItWorksModal({ onClose }) {
  const { t } = useT()
  const [step, setStep] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setStep((s) => Math.min(TOTAL - 1, s + 1))
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const services = t('howItWorks.services')
  const disclaimer = t('howItWorks.disclaimer')
  const isLegal = step === 3

  return createPortal(
    <div className="arch-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('howItWorks.title')}>
      <div className="arch-modal hiw-modal" onClick={(e) => e.stopPropagation()}>
        <header className="arch-modal-head">
          <div>
            <span className="arch-eyebrow">{t('header.eyebrow')} · {step + 1}/{TOTAL}</span>
            <h2>{t('howItWorks.title')}</h2>
          </div>
          <button className="arch-close" onClick={onClose} aria-label={t('arch.close')}>✕</button>
        </header>

        <div className="hiw-body">
          {!isLegal && Array.isArray(services) && services[step] && (
            <div className="hiw-slide">
              <span className="hiw-slide-icon">{SLIDE_ICONS[step]}</span>
              <h3 className="hiw-slide-title">{services[step].name}</h3>
              <p className="hiw-slide-desc">{services[step].desc}</p>
              {services[step].code && (
                <pre className="hiw-code">
                  <code>{services[step].code}</code>
                </pre>
              )}
            </div>
          )}

          {isLegal && (
            <div className="hiw-disclaimer">
              <h3 className="hiw-section hiw-section--warn">{SLIDE_ICONS[3]} {t('howItWorks.disclaimerTitle')}</h3>
              <p className="hiw-lead">{t('howItWorks.disclaimerLead')}</p>
              <ul className="hiw-list">
                {Array.isArray(disclaimer) &&
                  disclaimer.map((d, i) => (
                    <li key={i}>
                      <strong>{d.k}</strong> {d.v}
                    </li>
                  ))}
              </ul>
              <p className="hiw-foot">{t('howItWorks.disclaimerFoot')}</p>
            </div>
          )}
        </div>

        <footer className="hiw-nav">
          <button
            className="btn-ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            {t('howItWorks.prev')}
          </button>

          <div className="hiw-dots" role="tablist">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button
                key={i}
                type="button"
                className={`hiw-dot ${i === step ? 'hiw-dot--on' : ''}`}
                aria-label={`${i + 1}`}
                aria-selected={i === step}
                onClick={() => setStep(i)}
              />
            ))}
          </div>

          {step < TOTAL - 1 ? (
            <button className="btn-primary" onClick={() => setStep((s) => Math.min(TOTAL - 1, s + 1))}>
              {t('howItWorks.next')}
            </button>
          ) : (
            <button className="btn-primary" onClick={onClose}>
              {t('howItWorks.done')}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
