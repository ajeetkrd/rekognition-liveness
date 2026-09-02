// Invoke the orchestrator Lambda directly via SigV4. Credentials come from the
// WWSO portal's Cognito Identity Pool (see portalCredentials.js). The handler
// dispatches on `payload.action` and returns a raw JSON body; errors come back
// as `{ error, code }`.
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { REGION, getPortalCredentialProvider } from './portalCredentials.js'
import { trackPortalEvent } from './portalTracking.js'

const FUNCTION_NAME = import.meta.env.VITE_LAMBDA_FUNCTION_NAME || ''

let _client = null

function getClient() {
  if (_client) return _client
  if (!FUNCTION_NAME) {
    throw new Error('VITE_LAMBDA_FUNCTION_NAME is not configured.')
  }
  _client = new LambdaClient({
    region: REGION,
    credentials: getPortalCredentialProvider(),
  })
  return _client
}

/**
 * invoke({ action, ...args }) -> parsed JSON body.
 * Throws Error (with `.code`) on `{ error, code }` responses or SDK failures.
 */
export async function invoke(payload) {
  const client = getClient()
  const cmd = new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
    InvocationType: 'RequestResponse',
  })
  const t0 = Date.now()
  let out
  try {
    out = await client.send(cmd)
  } catch (err) {
    trackPortalEvent({
      feature: 'action-failed',
      eventType: 'error',
      metadata: { action: payload?.action, errorMessage: err?.message?.slice(0, 200), latencyMs: Date.now() - t0 },
    })
    throw err
  }
  const text = new TextDecoder().decode(out.Payload || new Uint8Array())
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Lambda returned non-JSON: ${text.slice(0, 200)}`)
  }
  if (body && body.error) {
    const err = new Error(body.error)
    err.code = body.code || 500
    trackPortalEvent({
      feature: 'action-failed',
      eventType: 'error',
      metadata: { action: payload?.action, errorMessage: String(body.error).slice(0, 200), latencyMs: Date.now() - t0 },
    })
    throw err
  }
  return body
}

export default { invoke }
