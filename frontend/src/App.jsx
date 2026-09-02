import React, { useEffect, useState } from 'react'
import { useT } from './i18n/I18nContext.jsx'
import Header from './components/layout/Header.jsx'
import LivenessTab from './components/LivenessTab.jsx'
import MovementTab from './components/MovementTab.jsx'
import GestureTab from './components/GestureTab.jsx'
import SearchTab from './components/SearchTab.jsx'
import EnrollTab from './components/EnrollTab.jsx'
import { trackPortalEvent, setActiveScenario } from './services/portalTracking.js'

const SAMPLES_URL = 'https://github.com/aws-samples/liveness-detection'
const DOCS_URL = 'https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html'

export default function App() {
  const { t } = useT()
  const [tab, setTab] = useState('liveness')

  useEffect(() => {
    // Attribute usage-report rows to the initial tab (Scenario column).
    setActiveScenario('liveness')
    trackPortalEvent({ feature: 'demo-loaded', eventType: 'access' })
  }, [])

  const selectTab = (next) => {
    setTab(next)
    // Remember the active tab so every subsequent event (run/complete) is
    // attributed to it in the portal Usage Report's Scenario column.
    setActiveScenario(next)
    window.__wwsoActivityLog?.logAction('tab-change', { tab: next })
    trackPortalEvent({ feature: 'scenario-opened', eventType: 'interaction', metadata: { scenario: next } })
  }

  const TABS = [
    ['liveness', t('tabs.liveness')],
    ['movement', t('tabs.movement')],
    ['gesture', t('tabs.gesture')],
    ['search', t('tabs.search')],
    ['enroll', t('tabs.enroll')],
  ]

  return (
    <div className="page">
      <Header samplesUrl={SAMPLES_URL} docsUrl={DOCS_URL} />

      <div className="app">
        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => selectTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="content">
          {tab === 'liveness' && <LivenessTab />}
          {tab === 'movement' && <MovementTab />}
          {tab === 'gesture' && <GestureTab />}
          {tab === 'search' && <SearchTab />}
          {tab === 'enroll' && <EnrollTab />}
        </main>

        <footer className="app-footer">{t('app.disclaimer')}</footer>
      </div>
    </div>
  )
}
