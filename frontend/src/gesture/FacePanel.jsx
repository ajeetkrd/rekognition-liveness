import { useT } from '../i18n/I18nContext.jsx'

const TRACKED = [
  { key: 'mouthSmileLeft', alt: 'mouthSmile_L' },
  { key: 'mouthSmileRight', alt: 'mouthSmile_R' },
  { key: 'eyeBlinkLeft', alt: 'eyeBlink_L' },
  { key: 'eyeBlinkRight', alt: 'eyeBlink_R' },
  { key: 'jawOpen' },
  { key: 'browInnerUp' },
  { key: 'mouthPucker' },
]

function findScore(blendshapes, names) {
  for (const n of names) {
    const hit = blendshapes.find((b) => b.categoryName === n)
    if (hit) return hit.score
  }
  return 0
}

export function FacePanel({ face }) {
  const { t } = useT()
  const blendshapes = face?.faceBlendshapes?.[0]?.categories
  const detected = !!blendshapes

  return (
    <section className="gpanel">
      <h2>{t('gesture.live.face')}{detected ? ` · ${t('gesture.live.faceDetected')}` : ''}</h2>
      {!detected && <p className="gpanel__hint">{t('gesture.live.showFace')}</p>}
      {detected && (
        <ul className="gpanel__bars">
          {TRACKED.map(({ key, alt }) => {
            const score = findScore(blendshapes, alt ? [key, alt] : [key])
            const pct = Math.round(score * 100)
            return (
              <li key={key}>
                <div className="gpanel__bar-row">
                  <span>{t(`gesture.live.blend.${key}`)}</span>
                  <span>{pct}%</span>
                </div>
                <div className="gpanel__bar-track">
                  <div className="gpanel__bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
