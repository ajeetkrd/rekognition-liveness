import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
} from '@mediapipe/tasks-vision'

// Assets are served SAME-ORIGIN under the demo base (bundled by
// scripts/fetch-mediapipe.mjs) — the portal CSP forbids jsdelivr /
// storage.googleapis at runtime.
const BASE = `${import.meta.env.BASE_URL}mediapipe`
const WASM_URL = `${BASE}/wasm`
const HAND_MODEL_URL = `${BASE}/gesture_recognizer.task`
const FACE_MODEL_URL = `${BASE}/face_landmarker.task`

let visionPromise = null

function getVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(WASM_URL)
  }
  return visionPromise
}

export async function createGestureRecognizer() {
  const vision = await getVision()
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  })
}

export async function createFaceLandmarker() {
  const vision = await getVision()
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    numFaces: 1,
  })
}
