import { useEffect, useRef, useState } from 'react'

export function useCamera({ width = 1280, height = 720 } = {}) {
  const videoRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let stream = null
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia não é suportado neste navegador.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width, height, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await new Promise((resolve) => {
          video.onloadedmetadata = () => resolve()
        })
        await video.play()
        setReady(true)
      } catch (err) {
        setError(err.message ?? 'Erro ao acessar a câmera.')
      }
    }

    start()
    return () => {
      cancelled = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [width, height])

  return { videoRef, ready, error }
}
