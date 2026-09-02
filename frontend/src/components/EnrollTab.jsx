import React, { useEffect, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { invoke } from '../services/lambdaService.js'
import { trackPortalEvent } from '../services/portalTracking.js'
import CameraCapture from './CameraCapture.jsx'
import FileButton from './FileButton.jsx'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function EnrollTab({ resetSignal }) {
  const { t } = useT()
  const [source, setSource] = useState('upload') // upload | camera
  const [name, setName] = useState('')
  const [faces, setFaces] = useState([])
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const data = await invoke({ action: 'faces/list' })
      setFaces(data.faces || [])
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    setMsg(null)
    window.__wwsoActivityLog?.logAction('enroll-refresh', {})
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resetSignal) {
      setSource('upload')
      setName('')
      setMsg(null)
    }
  }, [resetSignal])

  const removeFace = async (faceId, faceName) => {
    if (!window.confirm(t('enroll.confirmRemove', { name: faceName }))) return
    setBusy(true)
    setMsg(null)
    try {
      await invoke({ action: 'faces/delete', faceId })
      window.__wwsoActivityLog?.logAction('enroll-delete', {})
      setMsg({ type: 'success', text: t('enroll.removed', { name: faceName }) })
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const doEnroll = async (dataUrl) => {
    if (!name.trim()) {
      setMsg({ type: 'error', text: t('enroll.needName') })
      return
    }
    setBusy(true)
    setMsg(null)
    window.__wwsoActivityLog?.logAction('enroll-run', { source, nameChars: name.trim().length })
    trackPortalEvent({ feature: 'enroll-run', eventType: 'interaction', metadata: { source } })
    try {
      const data = await invoke({ action: 'faces/index', name, image: dataUrl })
      if (data.indexed) {
        setMsg({ type: 'success', text: t('enroll.enrolled', { name: data.name }) })
        setName('')
        await load()
      } else {
        setMsg({ type: 'error', text: data.message || t('enroll.noFace') })
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-intro">
        <h2>{t('enroll.title')}</h2>
        <p>{t('enroll.intro')}</p>
      </div>

      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <label className="field">
          <span>{t('enroll.nameLabel')}</span>
          <input
            type="text"
            value={name}
            placeholder={t('enroll.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="mode-toggle">
          <button
            className={source === 'camera' ? 'seg active' : 'seg'}
            onClick={() => {
              setSource('camera')
              setMsg(null)
            }}
          >
            {t('common.camera')}
          </button>
          <button
            className={source === 'upload' ? 'seg active' : 'seg'}
            onClick={() => {
              setSource('upload')
              setMsg(null)
            }}
          >
            {t('common.upload')}
          </button>
        </div>

        {source === 'camera' ? (
          <CameraCapture onCapture={doEnroll} busy={busy} captureLabel={t('enroll.captureLabel')} />
        ) : (
          <div className="field">
            <span>{t('enroll.uploadLabel')}</span>
            <FileButton disabled={busy} onSelect={async (f) => doEnroll(await fileToDataUrl(f))} />
            <small>{t('enroll.uploadHelp')}</small>
          </div>
        )}
      </div>

      <div className="card">
        <div className="enroll-list-head">
          <h3>{t('enroll.enrolledTitle', { count: faces.length })}</h3>
          <button className="btn-ghost btn-sm" onClick={refresh} disabled={refreshing || busy}>
            {refreshing ? `⟳ ${t('common.processing')}` : `⟳ ${t('enroll.refresh')}`}
          </button>
        </div>
        {faces.length === 0 ? (
          <p className="muted">{t('enroll.empty')}</p>
        ) : (
          <div className="face-grid">
            {faces.map((f) => (
              <figure className="face-card" key={f.faceId}>
                <button
                  className="face-delete"
                  title={t('enroll.remove')}
                  disabled={busy}
                  onClick={() => removeFace(f.faceId, f.name || t('enroll.noName'))}
                >
                  🗑️
                </button>
                {f.imageUrl ? (
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div className="face-placeholder" style={{ display: f.imageUrl ? 'none' : 'flex' }}>
                  👤
                </div>
                <figcaption>{f.name || t('enroll.noName')}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
