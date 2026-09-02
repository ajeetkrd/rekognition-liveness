import React, { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

/**
 * Live webcam preview with a capture button. On capture, produces a JPEG data
 * URL and calls onCapture(dataUrl).
 */
export default function CameraCapture({ onCapture, busy, captureLabel }) {
  const { t } = useT()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setReady(true)
      })
      .catch((e) => setError(t('common.cameraError', { message: e.message })))

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    onCapture(canvas.toDataURL('image/jpeg', 0.9))
  }

  if (error) return <div className="alert error">{error}</div>

  return (
    <div className="camera-capture">
      <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
      <button className="btn-primary" onClick={capture} disabled={busy || !ready}>
        {busy ? t('common.processing') : captureLabel}
      </button>
    </div>
  )
}
