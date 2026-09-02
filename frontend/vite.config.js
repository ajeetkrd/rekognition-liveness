import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHIM = path.resolve(__dirname, 'src/shims/empty-credential-provider.js')

// In dev, surface AWS credentials as VITE_DEV_AWS_* so lambdaService (and the
// Face Liveness credential provider) can fast-path past the portal Cognito
// flow, which is unreachable from localhost (the id_token cookie is scoped to
// the prod domain). Source of truth is the active terminal session — never a
// checked-in file. Restart the dev server to pick up renewed STS tokens.
function resolveAwsCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      source: 'env',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || '',
    }
  }

  const profile = process.env.AWS_PROFILE || 'default'

  try {
    const out = execFileSync(
      'aws',
      ['configure', 'export-credentials', '--profile', profile, '--format', 'process'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const j = JSON.parse(out)
    if (j.AccessKeyId && j.SecretAccessKey) {
      return {
        source: `aws-cli (${profile})`,
        accessKeyId: j.AccessKeyId,
        secretAccessKey: j.SecretAccessKey,
        sessionToken: j.SessionToken || '',
      }
    }
  } catch {
    // CLI missing / profile not configured / SSO expired — fall through.
  }

  const file =
    process.env.AWS_SHARED_CREDENTIALS_FILE ||
    path.join(os.homedir(), '.aws', 'credentials')
  try {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    let inProfile = false
    const out = {}
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || line.startsWith(';')) continue
      const section = line.match(/^\[(.+)\]$/)
      if (section) {
        inProfile = section[1].trim() === profile
        continue
      }
      if (!inProfile) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    if (out.aws_access_key_id) {
      return {
        source: `credentials file ([${profile}])`,
        accessKeyId: out.aws_access_key_id,
        secretAccessKey: out.aws_secret_access_key || '',
        sessionToken: out.aws_session_token || '',
      }
    }
  } catch {
    // No file or unreadable.
  }

  return { source: 'none', accessKeyId: '', secretAccessKey: '', sessionToken: '' }
}

// CRITICAL: `base` must match the path prefix the portal serves this demo at.
// Without it, CSS/JS 404 when CloudFront routes /demos/rekognition-liveness/* to S3.
export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const creds = isDev
    ? resolveAwsCredentials()
    : { source: 'build', accessKeyId: '', secretAccessKey: '', sessionToken: '' }
  if (isDev && creds.accessKeyId) {
    console.log(`vite.config: loaded AWS credentials from ${creds.source}`)
  } else if (isDev) {
    console.warn('vite.config: no usable AWS credentials found — Rekognition calls will fail.')
  }
  return {
    // Default matches the portal path prefix. For standalone S3+CloudFront
    // hosting at the domain root, build with VITE_BASE=/ .
    base: process.env.VITE_BASE || '/demos/rekognition-liveness/',
    plugins: [react()],
    server: { port: 5174 },
    build: { outDir: 'dist', sourcemap: true },
    define: {
      global: 'globalThis',
      'import.meta.env.VITE_DEV_AWS_ACCESS_KEY_ID': JSON.stringify(creds.accessKeyId),
      'import.meta.env.VITE_DEV_AWS_SECRET_ACCESS_KEY': JSON.stringify(creds.secretAccessKey),
      'import.meta.env.VITE_DEV_AWS_SESSION_TOKEN': JSON.stringify(creds.sessionToken),
    },
    resolve: {
      alias: {
        './runtimeConfig': './runtimeConfig.browser',
        // Node-only credential providers — never reached in the browser since
        // fromCognitoIdentityPool supplies credentials directly. Stubbing keeps
        // Rollup from choking on node:http / node:fs.
        '@smithy/credential-provider-imds': SHIM,
        '@aws-sdk/credential-provider-login': SHIM,
        '@aws-sdk/credential-provider-process': SHIM,
        '@aws-sdk/token-providers': SHIM,
        '@aws-sdk/credential-provider-sso': SHIM,
        '@aws-sdk/credential-provider-ini': SHIM,
        '@aws-sdk/credential-provider-node': SHIM,
        '@aws-sdk/credential-provider-env': SHIM,
        '@aws-sdk/credential-provider-web-identity': SHIM,
      },
    },
  }
})
