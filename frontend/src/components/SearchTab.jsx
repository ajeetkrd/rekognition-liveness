import React, { useEffect, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { invoke } from '../services/lambdaService.js'
import { trackPortalEvent } from '../services/portalTracking.js'
import CameraCapture from './CameraCapture.jsx'
import FileButton from './FileButton.jsx'
import { ArchitectureButton } from './ArchitectureModal.jsx'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function SearchTab({ resetSignal }) {
  const { t } = useT()
  const [source, setSource] = useState('camera') // camera | upload
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (resetSignal) {
      setSource('camera')
      setResult(null)
      setMsg(null)
    }
  }, [resetSignal])

  const doSearch = async (dataUrl) => {
    setBusy(true)
    setMsg(null)
    setResult(null)
    window.__wwsoActivityLog?.logAction('search-run', { source })
    trackPortalEvent({ feature: 'search-run', eventType: 'interaction', metadata: { source } })
    try {
      const data = await invoke({ action: 'faces/search', image: dataUrl })
      setResult(data)
      trackPortalEvent({ feature: 'search-complete', eventType: 'result', metadata: { matched: data?.matched } })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const switchSource = (s) => {
    setSource(s)
    setMsg(null)
    setResult(null)
  }

  return (
    <div className="panel">
      <div className="panel-intro">
        <div className="panel-intro-text">
          <h2>{t('search.title')}</h2>
          <p>{t('search.intro')}</p>
        </div>
        <ArchitectureButton demo="search" />
      </div>

      <div className="mode-toggle">
        <button className={source === 'camera' ? 'seg active' : 'seg'} onClick={() => switchSource('camera')}>
          {t('common.camera')}
        </button>
        <button className={source === 'upload' ? 'seg active' : 'seg'} onClick={() => switchSource('upload')}>
          {t('common.upload')}
        </button>
      </div>

      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        {source === 'camera' ? (
          <CameraCapture onCapture={doSearch} busy={busy} captureLabel={t('search.captureLabel')} />
        ) : (
          <div className="field">
            <span>{t('search.uploadLabel')}</span>
            <FileButton disabled={busy} onSelect={async (f) => doSearch(await fileToDataUrl(f))} />
            <small>{t('search.uploadHelp')}</small>
          </div>
        )}

        {result && (
          <div className={`result-card ${result.matched ? 'ok' : 'fail'}`}>
            <div className="result-head">
              <span className="result-main">
                {result.matched ? `✅ ${result.matches[0].name}` : `❌ ${t('search.notIdentified')}`}
              </span>
              {result.ageRange && (
                <span className="result-age">
                  🎂 {t('search.ageRange', { low: result.ageRange.low, high: result.ageRange.high })}
                </span>
              )}
            </div>
            {result.matched && (
              <span className="result-detail">
                {t('liveness.similarity', { similarity: result.matches[0].similarity })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
