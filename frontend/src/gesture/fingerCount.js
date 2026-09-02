// Conta dedos estendidos a partir dos 21 landmarks do MediaPipe.
// Usa o ângulo nas articulações (PIP/IP) — robusto a qualquer orientação
// da mão (palma, dorso, de cabeça pra baixo) e ao polegar.
//
// Índices dos landmarks:
//   0 wrist
//   1-4 thumb (cmc, mcp, ip, tip)
//   5-8 index (mcp, pip, dip, tip)
//   9-12 middle
//   13-16 ring
//   17-20 pinky

// Ângulo no vértice b formado pelos pontos a-b-c, em graus (0..180).
// Quando o dedo está reto, o ângulo é próximo de 180°.
function angleAt(a, b, c) {
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v1z = (a.z ?? 0) - (b.z ?? 0)
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const v2z = (c.z ?? 0) - (b.z ?? 0)
  const dot = v1x * v2x + v1y * v2y + v1z * v2z
  const m1 = Math.hypot(v1x, v1y, v1z)
  const m2 = Math.hypot(v2x, v2y, v2z)
  if (m1 === 0 || m2 === 0) return 180
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

// Para os 4 dedos: usa o ângulo no PIP (articulação do meio).
// Reto (~180°) = estendido, dobrado (<160°) = recolhido.
function isFingerExtended(landmarks, mcp, pip, tip) {
  return angleAt(landmarks[mcp], landmarks[pip], landmarks[tip]) > 160
}

// Para o polegar: combina dois critérios para evitar falso positivo
// quando o polegar está colado na lateral do punho fechado.
//   1. Ângulo no IP (entre MCP-IP-TIP) precisa estar reto.
//   2. A ponta do polegar precisa estar afastada da base do mindinho
//      (em punho fechado, ela fica perto; estendido, fica longe).
function isThumbExtended(landmarks) {
  const ipAngle = angleAt(landmarks[2], landmarks[3], landmarks[4])
  if (ipAngle < 155) return false

  const tip = landmarks[4]
  const pinkyMcp = landmarks[17]
  const indexMcp = landmarks[5]
  const palmWidth = Math.hypot(
    indexMcp.x - pinkyMcp.x,
    indexMcp.y - pinkyMcp.y,
    (indexMcp.z ?? 0) - (pinkyMcp.z ?? 0),
  )
  const tipToPinky = Math.hypot(
    tip.x - pinkyMcp.x,
    tip.y - pinkyMcp.y,
    (tip.z ?? 0) - (pinkyMcp.z ?? 0),
  )
  // Polegar estendido fica >1.4x a largura da palma de distância da base
  // do mindinho. Recolhido fica próximo (<1.0x).
  return tipToPinky > palmWidth * 1.2
}

export function countFingers(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return { count: 0, fingers: [false, false, false, false, false] }
  }

  const fingers = [
    isThumbExtended(landmarks),
    isFingerExtended(landmarks, 5, 6, 8),
    isFingerExtended(landmarks, 9, 10, 12),
    isFingerExtended(landmarks, 13, 14, 16),
    isFingerExtended(landmarks, 17, 18, 20),
  ]

  return { count: fingers.filter(Boolean).length, fingers }
}
