import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'
import { useT } from '../i18n/I18nContext.jsx'
import { invoke } from '../services/lambdaService.js'
import { trackPortalEvent } from '../services/portalTracking.js'
import { ArchitectureButton } from './ArchitectureModal.jsx'

const HOLD_FRAMES = 6 // frames with the nose on target before capturing

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

let modelsPromise = null
async function initBackend() {
  // TensorFlow.js needs a backend before detecting. Try WebGL (fast, no extra
  // files); fall back to CPU if unavailable.
  try {
    await faceapi.tf.setBackend('webgl')
  } catch {
    await faceapi.tf.setBackend('cpu')
  }
  await faceapi.tf.ready()
}
function loadModels() {
  if (!modelsPromise) {
    modelsPromise = initBackend().then(() =>
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/demos/rekognition-liveness/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/demos/rekognition-liveness/models'),
      ]),
    )
  }
  return modelsPromise
}

export default function MovementTab({ resetSignal }) {
  const { t } = useT()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const runningRef = useRef(false)
  const holdRef = useRef(0)
  const capturedRef = useRef(false)
  const challengeRef = useRef(null)
  const optionsRef = useRef(null)

  const [phase, setPhase] = useState('idle') // idle|loading|active|verifying|result
  const [hint, setHint] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => () => stopEverything(), [])

  useEffect(() => {
    if (resetSignal) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  // Attach the camera to <video> only once it's mounted (phase "active"),
  // then start the detection loop.
  useEffect(() => {
    if (phase !== 'active') return
    const video = videoRef.current
    if (!video || !streamRef.current) return
    video.srcObject = streamRef.current
    video.play().catch(() => {})
    if (!runningRef.current) {
      runningRef.current = true
      rafRef.current = requestAnimationFrame(detectLoop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const stopEverything = () => {
    runningRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }

  const start = async () => {
    setError(null)
    setResult(null)
    setPhase('loading')
    holdRef.current = 0
    capturedRef.current = false
    window.__wwsoActivityLog?.logAction('movement-start', {})
    trackPortalEvent({ feature: 'movement-run', eventType: 'interaction' })
    try {
      const [challenge] = await Promise.all([invoke({ action: 'movement/challenge' }), loadModels()])
      challengeRef.current = challenge
      optionsRef.current = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setHint(t('movement.hintBringNose'))
      setPhase('active') // the useEffect attaches the stream and starts the loop
    } catch (e) {
      setError(e.message || t('movement.startError'))
      setPhase('idle')
      stopEverything()
    }
  }

  const detectLoop = async () => {
    if (!runningRef.current) return
    const video = videoRef.current
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const det = await faceapi.detectSingleFace(video, optionsRef.current).withFaceLandmarks()
        drawAndCheck(det)
      } catch {
        /* ignore a frame with a detection error */
      }
    }
    if (runningRef.current) rafRef.current = requestAnimationFrame(detectLoop)
  }

  const drawAndCheck = (det) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const W = video.clientWidth
    const H = video.clientHeight
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    const ch = challengeRef.current
    const { x: tx, y: ty, half } = ch.target
    const fa = ch.faceArea || { x: 0.5, y: 0.5, halfW: 0.22, halfH: 0.3 }

    let noseInside = false
    let faceOk = false

    if (det) {
      const b = det.detection.box
      const fcx = (b.x + b.width / 2) / video.videoWidth
      const fcy = (b.y + b.height / 2) / video.videoHeight
      const fw = b.width / video.videoWidth
      faceOk = Math.abs(fcx - 0.5) <= 0.2 && Math.abs(fcy - 0.5) <= 0.22 && fw >= 0.16 && fw <= 0.8

      const nose = det.landmarks.positions[30]
      const nx = nose.x / video.videoWidth
      const ny = nose.y / video.videoHeight
      noseInside = Math.abs(nx - tx) <= half && Math.abs(ny - ty) <= half

      ctx.lineWidth = 2
      ctx.strokeStyle = faceOk ? '#16a34a' : '#9aa0ad'
      ctx.strokeRect(
        (b.x / video.videoWidth) * W,
        (b.y / video.videoHeight) * H,
        fw * W,
        (b.height / video.videoHeight) * H,
      )

      ctx.beginPath()
      ctx.arc(nx * W, ny * H, 7, 0, Math.PI * 2)
      ctx.fillStyle = noseInside ? '#16a34a' : '#2563eb'
      ctx.fill()
    }

    // Square 1 — FACE AREA (centered, solid)
    ctx.lineWidth = 3
    ctx.strokeStyle = faceOk ? '#16a34a' : '#2563eb'
    ctx.setLineDash([])
    roundRect(ctx, (fa.x - fa.halfW) * W, (fa.y - fa.halfH) * H, fa.halfW * 2 * W, fa.halfH * 2 * H, 16)
    ctx.stroke()

    // Square 2 — NOSE TARGET (dashed)
    ctx.lineWidth = 3
    ctx.strokeStyle = noseInside ? '#16a34a' : '#dc2626'
    ctx.setLineDash([9, 7])
    ctx.strokeRect((tx - half) * W, (ty - half) * H, half * 2 * W, half * 2 * H)
    ctx.setLineDash([])

    if (!det) {
      holdRef.current = 0
      setHint(t('movement.hintNoFace'))
      return
    }
    if (!faceOk) {
      holdRef.current = 0
      setHint(t('movement.hintCenter'))
      return
    }
    if (noseInside) {
      holdRef.current += 1
      setHint(t('movement.hintHold'))
      if (holdRef.current >= HOLD_FRAMES && !capturedRef.current) {
        capturedRef.current = true
        captureAndVerify()
      }
    } else {
      holdRef.current = 0
      setHint(t('movement.hintTurn'))
    }
  }

  const captureAndVerify = async () => {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.9)

    runningRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setPhase('verifying')
    try {
      const data = await invoke({ action: 'movement/verify', challengeId: challengeRef.current.challengeId, frame })
      setResult(data)
      setPhase('result')
      window.__wwsoActivityLog?.logAction('movement-complete', { isLive: data?.isLive, checks: data?.checks })
      trackPortalEvent({ feature: 'movement-complete', eventType: 'result', metadata: { isLive: data?.isLive } })
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    } finally {
      stopEverything()
    }
  }

  const manualCapture = () => {
    if (!capturedRef.current) {
      capturedRef.current = true
      captureAndVerify()
    }
  }

  const reset = () => {
    stopEverything()
    setResult(null)
    setError(null)
    setPhase('idle')
  }

  return (
    <div className="panel">
      <div className="panel-intro">
        <div className="panel-intro-text">
          <h2>{t('movement.title')}</h2>
          <p>
            {t('movement.intro')}{' '}
            {t('movement.basedOn')}{' '}
            <a href="https://github.com/aws-samples/liveness-detection" target="_blank" rel="noreferrer">
              aws-samples/liveness-detection
            </a>
            .
          </p>
        </div>
        <ArchitectureButton demo="movement" />
      </div>

      {error && <div className="alert error">⚠️ {error}</div>}

      {phase === 'idle' && !result && (
        <div className="card">
          <p className="muted">{t('movement.idleHint')}</p>
          <button className="btn-primary btn-lg" onClick={start}>
            {t('movement.start')}
          </button>
        </div>
      )}

      {phase === 'loading' && <p className="muted">{t('movement.loading')}</p>}

      {(phase === 'active' || phase === 'verifying') && (
        <div className="card">
          <div className="movement-stage">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} />
          </div>
          <p className="movement-hint">{phase === 'verifying' ? t('movement.verifying') : hint}</p>
          {phase === 'active' && (
            <button className="btn-ghost" onClick={manualCapture}>
              {t('movement.captureNow')}
            </button>
          )}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="results">
          <div className={`result-card ${result.isLive ? 'ok' : 'fail'}`}>
            <span className="result-title">{t('movement.resultTitle')}</span>
            <span className="result-main">
              {result.isLive ? `✅ ${t('movement.personReal')}` : `❌ ${t('movement.notConfirmed')}`}
            </span>
          </div>

          <div className="card">
            <h3>{t('movement.checksTitle')}</h3>
            <ul className="check-list">
              <li>{result.checks?.singleFace ? `✅ ${t('movement.checkSingleFaceOk')}` : `❌ ${t('movement.checkSingleFaceFail')}`}</li>
              <li>{result.checks?.faceCentered ? `✅ ${t('movement.checkCenteredOk')}` : `❌ ${t('movement.checkCenteredFail')}`}</li>
              <li>{result.checks?.noseOnTarget ? `✅ ${t('movement.checkNoseOk')}` : `❌ ${t('movement.checkNoseFail')}`}</li>
              <li>{result.checks?.rotated ? `✅ ${t('movement.checkRotatedOk')}` : `❌ ${t('movement.checkRotatedFail')}`}</li>
            </ul>
            {result.details?.pose && (
              <p className="muted">{t('movement.pose', { yaw: result.details.pose.yaw, pitch: result.details.pose.pitch })}</p>
            )}
          </div>

          <button className="btn-primary" onClick={reset}>
            {t('movement.newChallenge')}
          </button>
        </div>
      )}
    </div>
  )
}
