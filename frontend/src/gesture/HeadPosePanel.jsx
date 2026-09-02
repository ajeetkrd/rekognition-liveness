import { useT } from '../i18n/I18nContext.jsx'
import { landmarksToEuler, classifyDirection } from './headPose'

const GRID = [
  ['↖', '↑', '↗'],
  ['←', '●', '→'],
  ['↙', '↓', '↘'],
]

export function HeadPosePanel({ face }) {
  const { t } = useT()
  const landmarks = face?.faceLandmarks?.[0]
  const euler = landmarksToEuler(landmarks)

  if (!euler) {
    return (
      <section className="gpanel">
        <h2>{t('gesture.live.head')}</h2>
        <p className="gpanel__hint">{t('gesture.live.showFace')}</p>
      </section>
    )
  }

  const direction = classifyDirection(euler)
  const { yaw, pitch, roll } = euler

  return (
    <section className="gpanel">
      <h2>{t('gesture.live.head')} · {t(`gesture.live.dir.${direction.code}`)}</h2>
      <div className="gpose">
        <div className="gpose__compass">
          {GRID.map((row, y) =>
            row.map((arrow, x) => (
              <span
                key={`${x}-${y}`}
                className={`gpose__cell ${arrow === direction.arrow ? 'gpose__cell--on' : ''}`}
              >
                {arrow}
              </span>
            )),
          )}
        </div>
        <div className="gpose__angles">
          <Angle label="Yaw" value={yaw} hint={t('gesture.live.yawHint')} />
          <Angle label="Pitch" value={pitch} hint={t('gesture.live.pitchHint')} />
          <Angle label="Roll" value={roll} hint={t('gesture.live.rollHint')} />
        </div>
      </div>
    </section>
  )
}

function Angle({ label, value, hint }) {
  return (
    <div className="gpose__angle">
      <span className="gpose__angle-label">{label}</span>
      <span className="gpose__angle-value">{value.toFixed(0)}°</span>
      <span className="gpose__angle-hint">{hint}</span>
    </div>
  )
}
