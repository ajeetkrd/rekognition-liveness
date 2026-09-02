import { useEffect, useRef, useState } from 'react'
import {
  createGestureRecognizer,
  createFaceLandmarker,
} from './mediapipeLoader'

export function useDetectors({ videoRef, enabled }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [results, setResults] = useState({ hands: null, face: null, fps: 0 })

  const gestureRef = useRef(null)
  const faceRef = useRef(null)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)
  const fpsRef = useRef({ frames: 0, last: performance.now(), value: 0 })

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [gesture, face] = await Promise.all([
          createGestureRecognizer(),
          createFaceLandmarker(),
        ])
        if (cancelled) {
          gesture.close?.()
          face.close?.()
          return
        }
        gestureRef.current = gesture
        faceRef.current = face
        setLoading(false)
      } catch (err) {
        setError(err.message ?? 'Falha ao carregar modelos.')
        setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
      gestureRef.current?.close?.()
      faceRef.current?.close?.()
      gestureRef.current = null
      faceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || loading || error) return

    const video = videoRef.current
    if (!video) return

    function loop() {
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const now = performance.now()
      let timestamp = now
      if (timestamp <= lastTimeRef.current) {
        timestamp = lastTimeRef.current + 1
      }
      lastTimeRef.current = timestamp

      let hands = null
      let face = null

      try {
        if (gestureRef.current) {
          hands = gestureRef.current.recognizeForVideo(video, timestamp)
        }
        if (faceRef.current) {
          face = faceRef.current.detectForVideo(video, timestamp)
        }
      } catch (err) {
        console.error('Detection error', err)
      }

      const counter = fpsRef.current
      counter.frames += 1
      if (now - counter.last >= 1000) {
        counter.value = Math.round(
          (counter.frames * 1000) / (now - counter.last),
        )
        counter.frames = 0
        counter.last = now
      }

      setResults({ hands, face, fps: counter.value })
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loading, error, videoRef])

  return { loading, error, results }
}
