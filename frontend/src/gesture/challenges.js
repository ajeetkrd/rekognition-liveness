// Client-side gesture checks, keyed by the SAME ids the backend GESTURE_PROMPTS
// use. These drive the live "hold the gesture" detection + auto-capture in the
// browser; the captured frame is then sent to Bedrock for the authoritative
// verdict. All signals come from the MediaPipe models already running locally.
import { countFingers } from './fingerCount'
import { landmarksToEuler } from './headPose'

function blend(face, names) {
  const cats = face?.faceBlendshapes?.[0]?.categories
  if (!cats) return 0
  for (const n of names) {
    const hit = cats.find((c) => c.categoryName === n)
    if (hit) return hit.score
  }
  return 0
}

function anyGesture(hands, name) {
  return hands?.gestures?.some((g) => g?.[0]?.categoryName === name) ?? false
}

function eachHandGesture(hands, name) {
  const list = hands?.gestures
  return Boolean(list?.length >= 2 && list.every((g) => g?.[0]?.categoryName === name))
}

function fingerCounts(hands) {
  return (hands?.landmarks ?? []).map((lm) => countFingers(lm).count)
}

function anyFingerCount(hands, n) {
  return fingerCounts(hands).includes(n)
}

function totalFingers(hands) {
  return fingerCounts(hands).reduce((a, b) => a + b, 0)
}

const HEAD_THRESHOLD = 12 // degrees

function euler(face) {
  return landmarksToEuler(face?.faceLandmarks?.[0])
}

// Single-condition primitives.
const P = {
  thumb_up: (r) => anyGesture(r.hands, 'Thumb_Up'),
  victory: (r) => anyFingerCount(r.hands, 2) || anyGesture(r.hands, 'Victory'),
  open_palm: (r) => anyFingerCount(r.hands, 5) || anyGesture(r.hands, 'Open_Palm'),
  fist: (r) => anyGesture(r.hands, 'Closed_Fist') || anyFingerCount(r.hands, 0),
  point_up: (r) => anyFingerCount(r.hands, 1) || anyGesture(r.hands, 'Pointing_Up'),
  smile: (r) =>
    blend(r.face, ['mouthSmileLeft', 'mouthSmile_L']) > 0.4 &&
    blend(r.face, ['mouthSmileRight', 'mouthSmile_R']) > 0.4,
  wink: (r) => {
    const l = blend(r.face, ['eyeBlinkLeft', 'eyeBlink_L'])
    const rr = blend(r.face, ['eyeBlinkRight', 'eyeBlink_R'])
    return (l > 0.5 && rr < 0.35) || (rr > 0.5 && l < 0.35)
  },
  look_up: (r) => (euler(r.face)?.pitch ?? 0) > HEAD_THRESHOLD,
  look_down: (r) => (euler(r.face)?.pitch ?? 0) < -HEAD_THRESHOLD,
  // yaw > 0 = user's own right (see headPose.js).
  look_left: (r) => (euler(r.face)?.yaw ?? 0) < -HEAD_THRESHOLD,
  look_right: (r) => (euler(r.face)?.yaw ?? 0) > HEAD_THRESHOLD,
  both_hands_open: (r) => {
    const counts = fingerCounts(r.hands)
    return (counts.length >= 2 && counts.filter((c) => c >= 5).length >= 2) || eachHandGesture(r.hands, 'Open_Palm') || totalFingers(r.hands) >= 10
  },
  both_thumbs_up: (r) => eachHandGesture(r.hands, 'Thumb_Up'),
}

// Combined challenges: two conditions that must hold SIMULTANEOUSLY. Compose
// primitives with AND. Kept to non-contradictory pairs (a face/head action +
// a hand gesture, or two hands + a face action).
const all = (...ids) => (r) => ids.every((id) => P[id](r))

export const CHALLENGE_CHECKS = {
  ...P,
  smile_victory: all('smile', 'victory'),
  victory_look_up: all('victory', 'look_up'),
  open_palm_smile: all('open_palm', 'smile'),
  wink_thumb: all('wink', 'thumb_up'),
}
