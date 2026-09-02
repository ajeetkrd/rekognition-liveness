import React, { useEffect, useState } from 'react'
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import { useT } from '../i18n/I18nContext.jsx'
import { invoke } from '../services/lambdaService.js'
import { getLivenessConfig, LIVENESS_REGION } from '../services/livenessCredentials.js'
import { trackPortalEvent } from '../services/portalTracking.js'
import { ArchitectureButton } from './ArchitectureModal.jsx'
import FileButton from './FileButton.jsx'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function LivenessTab({ resetSignal }) {
  const { t } = useT()
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [documentImage, setDocumentImage] = useState(null)

  const reset = () => {
    setSessionId(null)
    setResult(null)
    setError(null)
  }

  // Header "Reset" returns this tab to its initial state.
  useEffect(() => {
    if (resetSignal) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  const start = async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    window.__wwsoActivityLog?.logAction('liveness-start', { withDocument: Boolean(documentImage) })
    trackPortalEvent({ feature: 'liveness-run', eventType: 'interaction', metadata: { withDocument: Boolean(documentImage) } })
    try {
      const { sessionId: sid } = await invoke({ action: 'liveness/create' })
      setSessionId(sid)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const onAnalysisComplete = async () => {
    setLoading(true)
    try {
      const data = await invoke({ action: 'verify', sessionId, documentImage })
      setResult(data)
      window.__wwsoActivityLog?.logAction('liveness-complete', {
        isLive: data?.liveness?.isLive,
        confidence: data?.liveness?.confidence,
        identityMatched: data?.identity?.matched,
        documentMatched: data?.document?.matched,
      })
      trackPortalEvent({
        feature: 'liveness-complete',
        eventType: 'result',
        metadata: {
          isLive: data?.liveness?.isLive,
          confidence: data?.liveness?.confidence,
          identityMatched: data?.identity?.matched,
          documentMatched: data?.document?.matched,
        },
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setSessionId(null)
    }
  }

  return (
    <div className="panel">
      <div className="panel-intro">
        <div className="panel-intro-text">
          <h2>{t('liveness.title')}</h2>
          <p>{t('liveness.intro')}</p>
        </div>
        <ArchitectureButton demo="liveness" />
      </div>

      {!sessionId && !result && (
        <div className="card">
          <div className="camera-cta">
            <div className="camera-icon">📷</div>
            <div>
              <strong>{t('liveness.cameraTitle')}</strong>
              <p className="muted">{t('liveness.cameraDesc')}</p>
            </div>
          </div>

          <button className="btn-primary btn-lg" onClick={start} disabled={loading}>
            {loading ? t('liveness.opening') : t('liveness.start')}
          </button>

          <details className="optional-doc">
            <summary>{t('liveness.docSummary')}</summary>
            <div className="field">
              <span>{t('liveness.docLabel')}</span>
              <FileButton onSelect={async (f) => setDocumentImage(await fileToDataUrl(f))} />
              <small>{t('liveness.docHelp')}</small>
            </div>
            {documentImage && <span className="muted">{t('liveness.docAttached')}</span>}
          </details>
        </div>
      )}

      {sessionId && (
        <div className="card liveness-box">
          <FaceLivenessDetector
            sessionId={sessionId}
            region={LIVENESS_REGION}
            config={getLivenessConfig()}
            onAnalysisComplete={onAnalysisComplete}
            onError={(e) => {
              setError(e?.error?.message || t('liveness.detectorError'))
              setSessionId(null)
            }}
          />
        </div>
      )}

      {loading && result === null && sessionId === null && (
        <p className="muted">{t('liveness.processingResult')}</p>
      )}

      {error && <div className="alert error">⚠️ {error}</div>}

      {result && (
        <div className="results">
          <ResultCard
            title={t('liveness.resultLivenessTitle')}
            ok={result.liveness?.isLive}
            main={result.liveness?.isLive ? t('liveness.personReal') : t('liveness.notConfirmed')}
            detail={t('liveness.confidence', {
              confidence: result.liveness?.confidence,
              threshold: result.liveness?.threshold,
            })}
          />

          {result.identity && (
            <ResultCard
              title={t('liveness.identityTitle')}
              ok={result.identity.matched}
              main={result.identity.matched ? result.identity.name : t('liveness.notEnrolled')}
              detail={
                result.identity.matched
                  ? t('liveness.similarity', { similarity: result.identity.similarity })
                  : result.identity.error || t('liveness.noMatch')
              }
            />
          )}

          {result.document && (
            <ResultCard
              title={t('liveness.docTitle')}
              ok={result.document.matched}
              main={result.document.matched ? t('liveness.docMatch') : t('liveness.docNoMatch')}
              detail={
                result.document.error
                  ? result.document.error
                  : t('liveness.similarity', { similarity: result.document.similarity })
              }
            />
          )}

          <button className="btn-primary" onClick={reset}>
            {t('liveness.newVerification')}
          </button>
        </div>
      )}
    </div>
  )
}

function ResultCard({ title, ok, main, detail }) {
  return (
    <div className={`result-card ${ok ? 'ok' : 'fail'}`}>
      <span className="result-title">{title}</span>
      <span className="result-main">
        {ok ? '✅' : '❌'} {main}
      </span>
      <span className="result-detail">{detail}</span>
    </div>
  )
}
