import React, { useEffect, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

/* Palette by service family */
const TONE = {
  client: '#4f46e5',
  portal: '#d97706',
  compute: '#7c3aed',
  ai: '#0d9488',
  data: '#475569',
}

/**
 * Per-tab architecture diagrams, described as a 2D topology and built from the
 * active locale (`t`):
 *   groups - grouping boxes (e.g. the "AWS Cloud" boundary)
 *   nodes  - positioned services (x, y, w, h in a 860x460 viewBox)
 *   edges  - directional connections (from/to + exit/enter side)
 *
 * The architecture is portal-integrated: no own Cognito and no API Gateway —
 * the browser gets AWS credentials from the WWSO portal's Identity Pool and
 * invokes the Lambda directly via SigV4. Face Liveness video streams straight
 * from the browser to Rekognition.
 */
function buildArchitectures(t) {
  const n = (k) => t(`arch.nodes.${k}`)
  return {
    liveness: {
      title: t('arch.liveness.title'),
      subtitle: t('arch.liveness.subtitle'),
      groups: [{ label: 'AWS Cloud', x: 248, y: 22, w: 598, h: 416 }],
      nodes: [
        { id: 'br', x: 14, y: 190, w: 150, h: 76, icon: '📷', title: n('browser'), sub: n('browserLiveness'), tone: 'client' },
        { id: 'portal', x: 278, y: 44, w: 168, h: 70, icon: '🔐', title: n('portal'), sub: n('portalSub'), tone: 'portal' },
        { id: 'rl', x: 664, y: 44, w: 168, h: 70, icon: '🧠', title: 'Rekognition', sub: n('rekLiveness'), tone: 'ai' },
        { id: 'lam', x: 420, y: 196, w: 158, h: 70, icon: 'λ', title: n('lambda'), sub: n('lambdaSub'), tone: 'compute' },
        { id: 'col', x: 664, y: 344, w: 168, h: 70, icon: '🗂️', title: 'Rekognition', sub: n('rekSearch'), tone: 'ai' },
      ],
      edges: [
        { from: 'br', fs: 'r', to: 'portal', ts: 'l', label: t('arch.liveness.edgeCreds'), tone: 'portal' },
        { from: 'br', fs: 'r', to: 'rl', ts: 'l', label: t('arch.liveness.edgeVideo'), tone: 'ai', flow: true },
        { from: 'br', fs: 'r', to: 'lam', ts: 'l', label: t('arch.liveness.edgeInvoke'), tone: 'compute' },
        { from: 'lam', fs: 't', to: 'rl', ts: 'b', label: t('arch.liveness.edgeResult'), tone: 'ai' },
        { from: 'lam', fs: 'r', to: 'col', ts: 'l', label: t('arch.liveness.edgeIdentify'), tone: 'ai' },
      ],
      note: t('arch.liveness.note'),
    },
    movement: {
      title: t('arch.movement.title'),
      subtitle: t('arch.movement.subtitle'),
      groups: [{ label: 'AWS Cloud', x: 248, y: 22, w: 598, h: 416 }],
      nodes: [
        { id: 'br', x: 14, y: 190, w: 150, h: 76, icon: '📷', title: n('browser'), sub: n('browserFaceApi'), tone: 'client' },
        { id: 'lam', x: 420, y: 196, w: 158, h: 70, icon: 'λ', title: n('lambda'), sub: n('lambdaSubCreate'), tone: 'compute' },
        { id: 'dyn', x: 286, y: 316, w: 158, h: 70, icon: '🗄️', title: 'DynamoDB', sub: n('dynamo'), tone: 'data' },
        { id: 'rek', x: 664, y: 196, w: 168, h: 70, icon: '🧠', title: 'Rekognition', sub: n('rekDetect'), tone: 'ai' },
      ],
      edges: [
        { from: 'br', fs: 'r', to: 'lam', ts: 'l', label: t('arch.movement.edgeChallenge'), tone: 'compute', flow: true },
        { from: 'lam', fs: 'r', to: 'rek', ts: 'l', label: t('arch.movement.edgeValidate'), tone: 'ai', flow: true },
        { from: 'lam', fs: 'b', to: 'dyn', ts: 'r', label: t('arch.movement.edgeStore'), tone: 'data' },
      ],
      note: '',
    },
    search: {
      title: t('arch.search.title'),
      subtitle: t('arch.search.subtitle'),
      groups: [{ label: 'AWS Cloud', x: 248, y: 22, w: 598, h: 416 }],
      nodes: [
        { id: 'br', x: 14, y: 190, w: 150, h: 76, icon: '📷', title: n('browser'), sub: 'camera / upload', tone: 'client' },
        { id: 'lam', x: 420, y: 196, w: 158, h: 70, icon: 'λ', title: n('lambda'), sub: n('lambdaSub'), tone: 'compute' },
        { id: 'rek', x: 664, y: 104, w: 168, h: 70, icon: '🧠', title: 'Rekognition', sub: n('rekSearch'), tone: 'ai' },
        { id: 's3', x: 664, y: 300, w: 168, h: 70, icon: '🪣', title: 'Amazon S3', sub: 'photo', tone: 'data' },
      ],
      edges: [
        { from: 'br', fs: 'r', to: 'lam', ts: 'l', label: t('arch.search.edgeInvoke'), tone: 'compute', flow: true },
        { from: 'lam', fs: 't', to: 'rek', ts: 'l', label: t('arch.search.edgeSearch'), tone: 'ai', flow: true },
        { from: 'lam', fs: 'b', to: 's3', ts: 'l', tone: 'data' },
      ],
      note: '',
    },
    gesture: {
      title: t('arch.gesture.title'),
      subtitle: t('arch.gesture.subtitle'),
      groups: [{ label: 'AWS Cloud', x: 248, y: 22, w: 598, h: 416 }],
      nodes: [
        { id: 'br', x: 14, y: 190, w: 150, h: 76, icon: '📷', title: n('browser'), sub: 'camera', tone: 'client' },
        { id: 'lam', x: 420, y: 196, w: 158, h: 70, icon: 'λ', title: n('lambda'), sub: n('lambdaSub'), tone: 'compute' },
        { id: 'bed', x: 664, y: 196, w: 168, h: 70, icon: '🧠', title: 'Amazon Bedrock', sub: n('bedrockSub'), tone: 'ai' },
      ],
      edges: [
        { from: 'br', fs: 'r', to: 'lam', ts: 'l', label: t('arch.gesture.edgeInvoke'), tone: 'compute', flow: true },
        { from: 'lam', fs: 'r', to: 'bed', ts: 'l', label: t('arch.gesture.edgeVerify'), tone: 'ai', flow: true },
      ],
      note: '',
    },
  }
}

/* ── Connector geometry ─────────────────────────────────────────────────── */
function anchor(nd, side) {
  switch (side) {
    case 'l': return { x: nd.x, y: nd.y + nd.h / 2 }
    case 'r': return { x: nd.x + nd.w, y: nd.y + nd.h / 2 }
    case 't': return { x: nd.x + nd.w / 2, y: nd.y }
    default: return { x: nd.x + nd.w / 2, y: nd.y + nd.h }
  }
}
function control(p, side, k) {
  switch (side) {
    case 'l': return { x: p.x - k, y: p.y }
    case 'r': return { x: p.x + k, y: p.y }
    case 't': return { x: p.x, y: p.y - k }
    default: return { x: p.x, y: p.y + k }
  }
}

export function ArchitectureButton({ demo }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="arch-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="arch-trigger-icon" aria-hidden="true">▤</span>
        {t('common.architecture')}
      </button>
      {open && <ArchitectureModal demo={demo} onClose={() => setOpen(false)} />}
    </>
  )
}

function ArchitectureModal({ demo, onClose }) {
  const { t } = useT()
  const data = buildArchitectures(t)[demo]
  const hasFrontend = demo === 'gesture' // extra "frontend & ML" step
  const STEPS = hasFrontend ? 2 : 1
  const [step, setStep] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (hasFrontend && e.key === 'ArrowRight') setStep((s) => Math.min(STEPS - 1, s + 1))
      if (hasFrontend && e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, hasFrontend, STEPS])

  if (!data) return null

  const frontend = t('arch.gesture.frontend')

  const byId = Object.fromEntries(data.nodes.map((nd) => [nd.id, nd]))
  const K = 58

  const edges = data.edges.map((e, i) => {
    const a = byId[e.from]
    const b = byId[e.to]
    const p1 = anchor(a, e.fs)
    const p2 = anchor(b, e.ts)
    const c1 = control(p1, e.fs, K)
    const c2 = control(p2, e.ts, K)
    const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
    const mx = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x
    const my = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y
    return { ...e, id: `edge-${demo}-${i}`, i, d, mx, my, color: TONE[e.tone] }
  })

  const tones = [...new Set(data.edges.map((e) => e.tone))]

  return (
    <div className="arch-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={data.title}>
      <div className="arch-modal" onClick={(e) => e.stopPropagation()}>
        <header className="arch-modal-head">
          <div>
            <span className="arch-eyebrow">
              {t('common.architecture')}{STEPS > 1 ? ` · ${step + 1}/${STEPS}` : ''}
            </span>
            <h2>{step === 1 ? t('arch.gesture.frontendTitle') : data.title}</h2>
            <p>{step === 1 ? t('arch.gesture.frontendLead') : data.subtitle}</p>
          </div>
          <button className="arch-close" onClick={onClose} aria-label={t('arch.close')}>✕</button>
        </header>

        {step === 1 && (
          <div className="hiw-body">
            <ul className="hiw-list hiw-list--lg">
              {Array.isArray(frontend) &&
                frontend.map((d, i) => (
                  <li key={i}>
                    <strong>{d.k}</strong> {d.v}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {step === 0 && (
        <div className="arch-diagram">
          <svg viewBox="0 0 860 460" className="arch-svg" role="img">
            <defs>
              <filter id="arch-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1e1b2e" floodOpacity="0.12" />
              </filter>
              {tones.map((tn) => (
                <marker
                  key={tn}
                  id={`arch-arrow-${demo}-${tn}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={TONE[tn]} />
                </marker>
              ))}
            </defs>

            {data.groups.map((g, i) => (
              <g key={i} className="arch-group">
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="18" fill="rgba(14,165,233,0.035)" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="7 6" />
                <text x={g.x + 18} y={g.y + 24} className="arch-group-label">☁ {g.label}</text>
              </g>
            ))}

            <g className="arch-edges">
              {edges.map((e) => (
                <g key={e.id}>
                  <path id={e.id} d={e.d} fill="none" stroke={e.color} strokeWidth="2" strokeOpacity={e.flow ? 0.95 : 0.5} markerEnd={`url(#arch-arrow-${demo}-${e.tone})`} />
                  {e.flow && <path d={e.d} fill="none" stroke={e.color} strokeWidth="2.4" className="arch-edge-flow" />}
                  <circle r="4.5" fill={e.color} className="arch-packet">
                    <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${e.i * 0.35}s`} keyPoints="0;1" keyTimes="0;1" calcMode="linear" rotate="auto">
                      <mpath href={`#${e.id}`} />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.4s" begin={`${e.i * 0.35}s`} repeatCount="indefinite" />
                  </circle>
                  {e.label && (
                    <text x={e.mx} y={e.my - 6} className="arch-edge-label" fill="#374151">{e.label}</text>
                  )}
                </g>
              ))}
            </g>

            <g className="arch-nodes">
              {data.nodes.map((nd, i) => {
                const color = TONE[nd.tone]
                const cy = nd.y + nd.h / 2
                return (
                  <g key={nd.id} className="arch-node" style={{ '--i': i, transformOrigin: `${nd.x + nd.w / 2}px ${cy}px` }}>
                    <rect x={nd.x} y={nd.y} width={nd.w} height={nd.h} rx="13" fill="#ffffff" stroke={color} strokeOpacity="0.35" strokeWidth="1.4" filter="url(#arch-shadow)" />
                    <rect x={nd.x} y={nd.y} width="5" height={nd.h} rx="2.5" fill={color} />
                    <circle cx={nd.x + 30} cy={cy} r="16" fill={color} />
                    <text x={nd.x + 30} y={cy} className="arch-node-icon" textAnchor="middle" dominantBaseline="central">{nd.icon}</text>
                    <text x={nd.x + 52} y={cy - 6} className="arch-node-title" fill="#1e1b2e">{nd.title}</text>
                    <text x={nd.x + 52} y={cy + 12} className="arch-node-sub" fill="#6b7280">{nd.sub}</text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
        )}

        {step === 0 && data.note && (
          <footer className="arch-note">
            <span className="arch-note-icon" aria-hidden="true">💡</span>
            {data.note}
          </footer>
        )}

        {STEPS > 1 && (
          <footer className="hiw-nav">
            <button
              className="btn-ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              {t('howItWorks.prev')}
            </button>
            <div className="hiw-dots" role="tablist">
              {Array.from({ length: STEPS }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`hiw-dot ${i === step ? 'hiw-dot--on' : ''}`}
                  aria-label={`${i + 1}`}
                  aria-selected={i === step}
                  onClick={() => setStep(i)}
                />
              ))}
            </div>
            {step < STEPS - 1 ? (
              <button className="btn-primary" onClick={() => setStep((s) => Math.min(STEPS - 1, s + 1))}>
                {t('howItWorks.next')}
              </button>
            ) : (
              <button className="btn-primary" onClick={onClose}>
                {t('howItWorks.done')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
