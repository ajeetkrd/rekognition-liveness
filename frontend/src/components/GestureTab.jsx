import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { invoke } from '../services/lambdaService.js'
import { trackPortalEvent } from '../services/portalTracking.js'
import { ArchitectureButton } from './ArchitectureModal.jsx'
import Fireworks from './Fireworks.jsx'
import { useCamera } from '../gesture/useCamera.js'
import { useDetectors } from '../gesture/useDetectors.js'
import { drawHands, drawFace, clear } from '../gesture/draw.js'
import { CHALLENGE_CHECKS } from '../gesture/challenges.js'
import { HandPanel } from '../gesture/HandPanel.jsx'
import { FacePanel } from '../gesture/FacePanel.jsx'
import { HeadPosePanel } from '../gesture/HeadPosePanel.jsx'

// Gestures verifiable from a single still frame (ids match backend
// GESTURE_PROMPTS and client CHALLENGE_CHECKS).
const GESTURES = [
  { id: 'thumb_up', emoji: '👍' },
  { id: 'victory', emoji: '✌️' },
  { id: 'open_palm', emoji: '🖐️' },
  { id: 'fist', emoji: '✊' },
  { id: 'point_up', emoji: '☝️' },
  { id: 'smile', emoji: '😄' },
  { id: 'wink', emoji: '😉' },
  { id: 'look_up', emoji: '⬆️' },
  { id: 'look_down', emoji: '⬇️' },
  { id: 'look_left', emoji: '⬅️' },
  { id: 'look_right', emoji: '➡️' },
  { id: 'both_hands_open', emoji: '🙌' },
  { id: 'both_thumbs_up', emoji: '👍👍' },
  // Combined challenges (two conditions at once).
  { id: 'smile_victory', emoji: '😄✌️' },
  { id: 'victory_look_up', emoji: '✌️⬆️' },
  { id: 'open_palm_smile', emoji: '🖐️😄' },
  { id: 'wink_thumb', emoji: '😉👍' },
]

const HOLD_MS = 500 // hold the gesture this long before auto-capturing

function pickGesture(excludeId) {
  const pool = GESTURES.filter((g) => g.id !== excludeId)
  const list = pool.length ? pool : GESTURES
  return list[Math.floor(Math.random() * list.length)]
}

function captureFrame(video) {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export default function GestureTab({ resetSignal }) {
  const { t } = useT()
  const { videoRef, ready: cameraReady, error: cameraError } = useCamera()
  const { loading, error: modelError, results } = useDetectors({ videoRef, enabled: cameraReady })
  const canvasRef = useRef(null)

  const [challenge, setChallenge] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | active | verifying | result
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [celebrating, setCelebrating] = useState(false)
  const burstIdRef = useRef(0)
  const heldSinceRef = useRef(0)
  const firedRef = useRef(false)

  const stopCelebrate = useCallback(() => setCelebrating(false), [])

  // Draw hand + face landmark overlays each time detection results change.
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    clear(ctx)
    drawFace(ctx, results.face)
    drawHands(ctx, results.hands)
  }, [results, videoRef])

  const runVerify = async () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const frame = captureFrame(video)
    setPhase('verifying')
    setError(null)
    try {
      const data = await invoke({ action: 'gesture/verify', gesture: challenge.id, frame })
      setResult(data)
      setPhase('result')
      if (data?.performed) {
        burstIdRef.current += 1
        setCelebrating(true)
      }
      window.__wwsoActivityLog?.logAction('gesture-complete', {
        gesture: challenge.id, performed: data?.performed, confidence: data?.confidence,
      })
      trackPortalEvent({
        feature: 'gesture-complete', eventType: 'result',
        metadata: { gesture: challenge.id, performed: data?.performed, confidence: data?.confidence },
      })
    } catch (e) {
      setError(e.message)
      setPhase('active')
    }
  }

  // While a challenge is active, watch live detection: when the gesture is held
  // continuously for HOLD_MS, auto-capture and send to Bedrock.
  useEffect(() => {
    if (phase !== 'active' || !challenge) return
    const check = CHALLENGE_CHECKS[challenge.id]
    const now = performance.now()
    if (check && check(results)) {
      if (heldSinceRef.current === 0) heldSinceRef.current = now
      const elapsed = now - heldSinceRef.current
      if (elapsed >= HOLD_MS && !firedRef.current) {
        firedRef.current = true
        setProgress(1)
        runVerify()
      } else {
        setProgress(Math.min(1, elapsed / HOLD_MS))
      }
    } else {
      heldSinceRef.current = 0
      setProgress(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, phase, challenge])

  const generate = () => {
    heldSinceRef.current = 0
    firedRef.current = false
    setProgress(0)
    setResult(null)
    setError(null)
    setChallenge((prev) => pickGesture(prev?.id))
    setPhase('active')
    window.__wwsoActivityLog?.logAction('gesture-generate', {})
    trackPortalEvent({ feature: 'gesture-run', eventType: 'interaction' })
  }

  const reset = () => {
    heldSinceRef.current = 0
    firedRef.current = false
    setChallenge(null)
    setResult(null)
    setError(null)
    setProgress(0)
    setPhase('idle')
  }

  useEffect(() => {
    if (resetSignal) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  const statusText = loading
    ? t('gesture.live.loading')
    : cameraReady
      ? t('gesture.live.ready', { fps: results.fps })
      : cameraError
        ? cameraError
        : t('gesture.live.waiting')

  return (
    <div className="panel">
      {celebrating && <Fireworks key={burstIdRef.current} onDone={stopCelebrate} />}
      <div className="panel-intro">
        <div className="panel-intro-text">
          <h2>{t('gesture.title')}</h2>
          <p>{t('gesture.intro')}</p>
        </div>
        <ArchitectureButton demo="gesture" />
      </div>

      <div className="gv-wide">
        <p className="muted gv-status">{statusText}</p>
        {(cameraError || modelError || error) && (
          <div className="alert error gv-status">⚠️ {cameraError || modelError || error}</div>
        )}

        <div className="gv-layout">
          {/* Left: face detection */}
          <div className="gv-side">
            <FacePanel face={results.face} />
          </div>

          {/* Center: live camera + the Bedrock-backed challenge */}
          <div className="gv-main">
            <div className="gv-stage">
              <video ref={videoRef} className="gv-video" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="gv-canvas" />
            </div>

            <div className="gesture-cards">
              <section className="gpanel gesture-card-main">
                <h2>{t('gesture.title')}</h2>
                <div className="gesture-body">
                  {phase === 'idle' && <p className="gpanel__hint">{t('gesture.ctaDesc')}</p>}

                  {challenge && (
                    <>
                      <div className="gesture-challenge">
                        <span className="gesture-emoji">{challenge.emoji}</span>
                        <div>
                          <span className="result-title">{t('gesture.performTitle')}</span>
                          <div className="gesture-label">{t(`gesture.labels.${challenge.id}`)}</div>
                        </div>
                      </div>

                      {phase === 'active' && (
                        <>
                          <div className="gpanel__bar-track">
                            <div className="gpanel__bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                          </div>
                          <p className="gpanel__hint">{progress > 0 ? t('gesture.holding') : t('gesture.detecting')}</p>
                        </>
                      )}

                      {phase === 'verifying' && <p className="gpanel__hint">{t('gesture.verifying')}</p>}

                      {phase === 'result' && result && (
                        <div className={`result-card ${result.performed ? 'ok' : 'fail'}`}>
                          <span className="result-main">
                            {result.performed ? `✅ ${t('gesture.passed')}` : `❌ ${t('gesture.failed')}`}
                          </span>
                          {typeof result.confidence === 'number' && (
                            <span className="result-detail">{t('gesture.confidence', { confidence: result.confidence })}</span>
                          )}
                          {result.reason && <span className="result-detail">{result.reason}</span>}
                          <span className="result-detail muted">{t('gesture.poweredBy', { model: result.modelId })}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section className="gpanel gesture-card-actions">
                <h2>{t('gesture.controls')}</h2>
                <div className="gesture-actions">
                  <button className="btn-primary" onClick={generate} disabled={phase === 'verifying'}>
                    {!challenge
                      ? t('gesture.generate')
                      : phase === 'result'
                        ? t('gesture.newChallenge')
                        : t('gesture.changeChallenge')}
                  </button>
                  {phase === 'active' && (
                    <button className="btn-primary" onClick={runVerify}>
                      {t('gesture.captureVerify')}
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Right: head pose + hands */}
          <div className="gv-side">
            <HeadPosePanel face={results.face} />
            <HandPanel hands={results.hands} />
          </div>
        </div>
      </div>
    </div>
  )
}
