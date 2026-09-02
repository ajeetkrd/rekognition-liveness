// Baixa os pesos do face-api.js (tiny_face_detector + face_landmark_68) para
// frontend/public/models, para serem servidos estaticamente pelo CloudFront.
// Executado no prebuild. Pula o download se os arquivos ja existem.
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE =
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model/";
const MANIFESTS = [
  "tiny_face_detector_model-weights_manifest.json",
  "face_landmark_68_model-weights_manifest.json",
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "models");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`Falha ao baixar ${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const manifestName of MANIFESTS) {
    const manifestPath = join(outDir, manifestName);
    const manifestBuf = await download(manifestName);
    await writeFile(manifestPath, manifestBuf);

    const manifest = JSON.parse(manifestBuf.toString());
    const paths = manifest.flatMap((g) => g.paths);
    for (const p of paths) {
      const dest = join(outDir, p);
      if (await exists(dest)) continue;
      await writeFile(dest, await download(p));
      console.log(`  baixado: ${p}`);
    }
    console.log(`ok: ${manifestName} (${paths.length} shard(s))`);
  }
  console.log(`Modelos em ${outDir}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
