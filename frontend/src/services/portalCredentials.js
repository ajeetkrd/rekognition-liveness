// Shared AWS credentials for the rekognition-liveness demo.
//
// Auth model in production (WWSO portal-integrated build):
//   1. The user already authenticated against the WWSO portal's Lambda@Edge,
//      which set Cognito cookies on the portal domain.
//   2. We read the `idToken` cookie issued by the portal's User Pool.
//   3. We exchange that ID token for temporary AWS credentials via the
//      portal's Cognito Identity Pool.
//
// The SAME credential provider is reused by:
//   - lambdaService.js       — SigV4-invoke the orchestrator Lambda.
//   - livenessCredentials.js — feed the Amplify FaceLivenessDetector, which
//                              streams video straight from the browser to
//                              Rekognition (rekognition:StartFaceLivenessSession).
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'

export const REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'
const USER_POOL_ID = import.meta.env.VITE_PORTAL_USER_POOL_ID || ''
const IDENTITY_POOL_ID = import.meta.env.VITE_PORTAL_IDENTITY_POOL_ID || ''
const CLIENT_ID = import.meta.env.VITE_PORTAL_USER_POOL_CLIENT_ID || ''
// Standalone hosting (no WWSO portal / no SSO): an unauthenticated Cognito
// Identity Pool issues guest AWS credentials to the browser. Set at build time
// by the standalone S3+CloudFront deploy. When present (and no portal User Pool
// is configured), we take the guest path below instead of the cookie flow.
const GUEST_IDENTITY_POOL_ID = import.meta.env.VITE_GUEST_IDENTITY_POOL_ID || ''

let _provider = null
let _cachedIdToken = null
let _guestProvider = null

export function readPortalIdTokenCookie() {
  // Portal sets cookie shaped `CognitoIdentityServiceProvider.{clientId}.{sub}.idToken`.
  if (typeof document === 'undefined') return null
  const cookies = document.cookie.split(';').map((c) => c.trim())
  const prefix = CLIENT_ID
    ? `CognitoIdentityServiceProvider.${CLIENT_ID}.`
    : 'CognitoIdentityServiceProvider.'
  const match = cookies.find(
    (c) => c.startsWith(prefix) && c.includes('.idToken='),
  )
  if (!match) return null
  return decodeURIComponent(match.split('=').slice(1).join('='))
}

function devShellCredentials() {
  const key = import.meta.env.VITE_DEV_AWS_ACCESS_KEY_ID
  const secret = import.meta.env.VITE_DEV_AWS_SECRET_ACCESS_KEY
  if (!key || !secret) return null
  return {
    accessKeyId: key,
    secretAccessKey: secret,
    sessionToken: import.meta.env.VITE_DEV_AWS_SESSION_TOKEN || undefined,
  }
}

/**
 * Returns an AWS credential provider (an async function resolving to
 * credentials) usable by both the Lambda SDK client and the Amplify
 * FaceLivenessDetector's `config.credentialProvider`.
 *
 * Local dev shortcut: if VITE_DEV_AWS_* are baked (see vite.config.js), use
 * them directly — the portal cookie is unreachable from localhost.
 */
export function getPortalCredentialProvider() {
  const shell = devShellCredentials()
  if (shell) {
    return async () => shell
  }

  // Standalone guest path: no portal User Pool, credentials come from an
  // unauthenticated Identity Pool (no logins map). Used by the S3+CloudFront
  // hosted build.
  if (GUEST_IDENTITY_POOL_ID && !USER_POOL_ID) {
    if (!_guestProvider) {
      _guestProvider = fromCognitoIdentityPool({
        clientConfig: { region: REGION },
        identityPoolId: GUEST_IDENTITY_POOL_ID,
      })
    }
    return _guestProvider
  }

  if (!USER_POOL_ID || !IDENTITY_POOL_ID || !CLIENT_ID) {
    throw new Error(
      'Portal Cognito configuration missing — VITE_PORTAL_USER_POOL_ID / ' +
        'VITE_PORTAL_USER_POOL_CLIENT_ID / VITE_PORTAL_IDENTITY_POOL_ID. ' +
        'These are injected by scripts/deploy-demo.sh.',
    )
  }

  const idToken = readPortalIdTokenCookie()
  if (!idToken) {
    // Lambda@Edge normally redirects unauthenticated users before any JS runs,
    // so reaching here means the cookie expired mid-session. Reload once to
    // let the edge re-authenticate (guarded against reload storms by the
    // browser navigating away).
    if (typeof window !== 'undefined') window.location.reload()
    throw new Error('Portal session not found — reloading to re-authenticate.')
  }

  // Reuse the provider unless the cookie changed (e.g. signed in as someone
  // else in another tab) so the SDK can apply its own refresh logic.
  if (_provider && _cachedIdToken === idToken) return _provider

  _provider = fromCognitoIdentityPool({
    clientConfig: { region: REGION },
    identityPoolId: IDENTITY_POOL_ID,
    logins: {
      [`cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`]: idToken,
    },
  })
  _cachedIdToken = idToken
  return _provider
}
