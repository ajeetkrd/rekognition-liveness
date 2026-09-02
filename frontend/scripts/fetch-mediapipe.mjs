// Bundle MediaPipe assets LOCALLY so the gesture-liveness tab works behind the
// portal CSP (default-src 'self' — no jsdelivr / storage.googleapis at runtime).
//
//   1. Copy the tasks-vision WASM runtime from node_modules → public/mediapipe/wasm/
//   2. Download the two .task models (gesture_recognizer + face_landmarker) →
//      public/mediapipe/  (skipped if already present)
//
// Runs at predev/prebuild. Served same-origin under /demos/rekognition-liveness/mediapipe/.
import { mkdir, writeFile, access, cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = join(here, '..')
const outDir = join(frontend, 'public', 'mediapipe')
const wasmSrc = join(frontend, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmOut = join(outDir, 'wasm')

const MODELS = [
  {
    file: 'gesture_recognizer.task',
    url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  },
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
]

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })

  // 1) WASM runtime — copied from the installed npm package (version-consistent).
  if (await exists(wasmSrc)) {
    await cp(wasmSrc, wasmOut, { recursive: true })
    console.log(`ok: copied tasks-vision wasm → ${wasmOut}`)
  } else {
    console.error(
      `ERROR: ${wasmSrc} not found. Run "npm install" first (needs @mediapipe/tasks-vision).`,
    )
    process.exit(1)
  }

  // 2) Task models — downloaded once (binary, gitignored).
  for (const m of MODELS) {
    const dest = join(outDir, m.file)
    if (await exists(dest)) {
      console.log(`skip: ${m.file} (already present)`)
      continue
    }
    const res = await fetch(m.url)
    if (!res.ok) throw new Error(`Failed to download ${m.file}: HTTP ${res.status}`)
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    console.log(`ok: downloaded ${m.file}`)
  }
  console.log(`MediaPipe assets in ${outDir}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
