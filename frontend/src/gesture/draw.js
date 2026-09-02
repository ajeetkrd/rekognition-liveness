import {
  GestureRecognizer,
  FaceLandmarker,
} from '@mediapipe/tasks-vision'

function drawConnections(ctx, landmarks, connections, { color, width }) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  for (const c of connections) {
    const a = landmarks[c.start]
    const b = landmarks[c.end]
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(a.x * ctx.canvas.width, a.y * ctx.canvas.height)
    ctx.lineTo(b.x * ctx.canvas.width, b.y * ctx.canvas.height)
    ctx.stroke()
  }
}

function drawPoints(ctx, landmarks, { color, radius }) {
  ctx.fillStyle = color
  for (const p of landmarks) {
    ctx.beginPath()
    ctx.arc(
      p.x * ctx.canvas.width,
      p.y * ctx.canvas.height,
      radius,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
}

export function drawHands(ctx, handsResult) {
  if (!handsResult?.landmarks?.length) return
  for (const landmarks of handsResult.landmarks) {
    drawConnections(ctx, landmarks, GestureRecognizer.HAND_CONNECTIONS, {
      color: '#22d3ee',
      width: 3,
    })
    drawPoints(ctx, landmarks, { color: '#f97316', radius: 4 })
  }
}

const FACE_CONTOUR_GROUPS = [
  { conns: FaceLandmarker.FACE_LANDMARKS_TESSELATION, color: 'rgba(255,255,255,0.15)', width: 1 },
  { conns: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, color: '#a78bfa', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_LIPS, color: '#f472b6', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, color: '#34d399', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, color: '#34d399', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, color: '#fbbf24', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, color: '#fbbf24', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, color: '#60a5fa', width: 2 },
  { conns: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, color: '#60a5fa', width: 2 },
]

export function drawFace(ctx, faceResult) {
  if (!faceResult?.faceLandmarks?.length) return
  for (const landmarks of faceResult.faceLandmarks) {
    for (const group of FACE_CONTOUR_GROUPS) {
      drawConnections(ctx, landmarks, group.conns, {
        color: group.color,
        width: group.width,
      })
    }
  }
}

export function clear(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}
