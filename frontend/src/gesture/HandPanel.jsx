import { useT } from '../i18n/I18nContext.jsx'
import { countFingers } from './fingerCount'

const GESTURE_EMOJI = {
  Closed_Fist: '✊',
  Open_Palm: '🖐️',
  Pointing_Up: '☝️',
  Thumb_Down: '👎',
  Thumb_Up: '👍',
  Victory: '✌️',
  ILoveYou: '🤟',
}

const NUMBER_EMOJI = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️']

export function HandPanel({ hands }) {
  const { t } = useT()
  const detected = hands?.landmarks?.length ?? 0

  return (
    <section className="gpanel gpanel--hands">
      <h2>{t('gesture.live.hands')} · {detected}</h2>
      {detected === 0 && <p className="gpanel__hint">{t('gesture.live.showHand')}</p>}
      {hands?.landmarks?.map((landmarks, i) => {
        const top = hands.gestures?.[i]?.[0]
        const handedness = hands.handedness?.[i]?.[0]?.categoryName
        const gestureName = top && top.categoryName !== 'None' ? top.categoryName : null
        const gestureLabel = gestureName ? t(`gesture.live.gestures.${gestureName}`) : null
        const gestureEmoji = gestureName ? GESTURE_EMOJI[gestureName] : null
        const { count, fingers } = countFingers(landmarks)
        // The model is trained on mirrored video, so its "Right" is the user's
        // right hand (shown on the left in the mirrored preview).
        const handedLabel =
          handedness === 'Right'
            ? t('gesture.live.right')
            : handedness === 'Left'
              ? t('gesture.live.left')
              : ''

        return (
          <div key={i} className="gpanel__row">
            <span className="gpanel__emoji">{NUMBER_EMOJI[count] ?? '✋'}</span>
            <div className="gpanel__hand">
              <div className="gpanel__label">
                {count === 1 ? t('gesture.live.fingersOne', { n: count }) : t('gesture.live.fingersMany', { n: count })}
              </div>
              <div className="gpanel__sub">
                {handedLabel}
                {gestureLabel && (
                  <>
                    {' · '}
                    <span className="gpanel__gesture">{gestureEmoji} {gestureLabel}</span>
                  </>
                )}
              </div>
              <FingerDots fingers={fingers} />
            </div>
          </div>
        )
      })}
    </section>
  )
}

function FingerDots({ fingers }) {
  const labels = ['👍', '☝️', '🖕', '💍', '🤙']
  return (
    <div className="gpanel__dots">
      {fingers.map((on, i) => (
        <span key={i} className={`gpanel__dot ${on ? 'gpanel__dot--on' : ''}`} title={labels[i]} />
      ))}
    </div>
  )
}
