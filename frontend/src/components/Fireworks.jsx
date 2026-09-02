import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Lightweight canvas fireworks — a full-screen, pointer-events-none overlay
// that plays a short celebratory burst then calls onDone. No dependencies.
const COLORS = ['#00f0ff', '#ff00aa', '#fbbf24', '#a78bfa', '#00ff88', '#fb923c', '#ffffff']
const DURATION = 2600

export default function Fireworks({ onDone }) {
  const canvasRef = useRef(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      const to = setTimeout(() => onDoneRef.current?.(), 200)
      return () => clearTimeout(to)
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let w = 0
    let h = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.width = Math.floor(window.innerWidth * dpr)
      h = canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const particles = []
    const burst = (x, y) => {
      const n = 60 + Math.floor(Math.random() * 40)
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.3
        const speed = (2 + Math.random() * 4.5) * dpr
        particles.push({
          x, y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 1,
          color,
          size: (1.5 + Math.random() * 2) * dpr,
        })
      }
    }

    const start = performance.now()
    let lastBurst = 0
    let raf = 0
    const frame = (now) => {
      const t = now - start
      if (t - lastBurst > 230 && t < 1700) {
        lastBurst = t
        burst((0.15 + Math.random() * 0.7) * w, (0.15 + Math.random() * 0.45) * h)
      }
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.vy += 0.05 * dpr // gravity
        p.vx *= 0.99
        p.vy *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.012
        if (p.life <= 0) continue
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life <= 0) particles.splice(i, 1)
      }
      if (t < DURATION || particles.length) {
        raf = requestAnimationFrame(frame)
      } else {
        onDoneRef.current?.()
      }
    }

    // Kick off with two immediate bursts so it pops instantly.
    burst(0.35 * w, 0.4 * h)
    burst(0.65 * w, 0.35 * h)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 }}
    />,
    document.body,
  )
}
