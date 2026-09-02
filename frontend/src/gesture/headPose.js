// Calcula yaw / pitch / roll diretamente dos landmarks 3D do rosto.
//
// Convenção de coordenadas dos landmarks (image-space, sistema canhoto):
//   x: 0 (esquerda da imagem) → 1 (direita)
//   y: 0 (topo) → 1 (rodapé)         ← Y aponta para BAIXO
//   z: 0 no centro do rosto, valores menores = mais perto da câmera
//
// Em vídeo não-espelhado, a pessoa está de frente para a câmera, então:
//   olho direito da pessoa → x menor (à esquerda da imagem)
//   olho esquerdo da pessoa → x maior (à direita da imagem)

const RIGHT_EYE_OUTER = 33   // canto externo do olho direito da pessoa
const LEFT_EYE_OUTER = 263   // canto externo do olho esquerdo da pessoa
const FOREHEAD = 10
const CHIN = 152

const RAD_TO_DEG = 180 / Math.PI

function vec(p) {
  return [p.x, p.y, p.z ?? 0]
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function length(v) {
  return Math.hypot(v[0], v[1], v[2])
}
function normalize(v) {
  const L = length(v)
  return L > 0 ? [v[0] / L, v[1] / L, v[2] / L] : [0, 0, 0]
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function landmarksToEuler(landmarks) {
  if (!landmarks || landmarks.length < 478) return null

  const eyeR = vec(landmarks[RIGHT_EYE_OUTER])
  const eyeL = vec(landmarks[LEFT_EYE_OUTER])
  const fh = vec(landmarks[FOREHEAD])
  const ch = vec(landmarks[CHIN])

  // faceX: vetor unitário no eixo lateral do rosto (do olho esquerdo da
  // pessoa para o direito). Em image-space, ≈ (-1, 0, 0) quando rosto frontal.
  const faceX = normalize(sub(eyeR, eyeL))

  // faceDown: vetor unitário no eixo vertical do rosto (testa → queixo),
  // ortogonalizado contra faceX. ≈ (0, +1, 0) quando frontal (Y aponta down).
  const downRaw = sub(ch, fh)
  const proj = dot(downRaw, faceX)
  const faceDown = normalize([
    downRaw[0] - proj * faceX[0],
    downRaw[1] - proj * faceX[1],
    downRaw[2] - proj * faceX[2],
  ])

  // forward: vetor saindo pelo nariz, em direção à câmera.
  // Em image-space: cross(faceX, faceDown) com faceX≈(-1,0,0) e faceDown≈(0,1,0)
  //   → (0, 0, -1) (perto da câmera). ✓
  const forward = cross(faceX, faceDown)

  // YAW: rotação horizontal. Quando o usuário olha para a sua direita,
  // o nariz se desloca para -X imagem (em vídeo não-espelhado), então
  // forward.x < 0. Invertemos o sinal para que "direita do usuário" = yaw > 0.
  const yaw = -Math.atan2(forward[0], -forward[2]) * RAD_TO_DEG

  // PITCH: rotação vertical. Olhar para cima faz o nariz subir na imagem,
  // forward.y < 0 (Y é down). Invertemos para que "cima" = pitch > 0.
  const horiz = Math.hypot(forward[0], forward[2])
  const pitch = -Math.atan2(forward[1], horiz) * RAD_TO_DEG

  // ROLL: inclinação lateral, medida pela linha entre os olhos em 2D.
  // Vetor (eyeL - eyeR) ≈ (+1, 0) quando reto. Inclinar cabeça para a direita
  // do usuário (em vídeo não-espelhado) faz o olho direito do usuário descer
  // (eyeR.y aumenta) e o esquerdo subir (eyeL.y diminui), então
  // eyeL.y - eyeR.y < 0 → atan2(neg, +) < 0. Invertemos para roll > 0.
  const roll =
    -Math.atan2(eyeL[1] - eyeR[1], eyeL[0] - eyeR[0]) * RAD_TO_DEG

  return { yaw, pitch, roll }
}

const COMPASS = {
  '0,0': { code: 'center', arrow: '●' },
  '0,1': { code: 'up', arrow: '↑' },
  '0,-1': { code: 'down', arrow: '↓' },
  '1,0': { code: 'right', arrow: '→' },
  '-1,0': { code: 'left', arrow: '←' },
  '1,1': { code: 'upRight', arrow: '↗' },
  '-1,1': { code: 'upLeft', arrow: '↖' },
  '1,-1': { code: 'downRight', arrow: '↘' },
  '-1,-1': { code: 'downLeft', arrow: '↙' },
}

export function classifyDirection({ yaw, pitch }, threshold = 12) {
  const x = yaw > threshold ? 1 : yaw < -threshold ? -1 : 0
  const y = pitch > threshold ? 1 : pitch < -threshold ? -1 : 0
  return COMPASS[`${x},${y}`]
}
