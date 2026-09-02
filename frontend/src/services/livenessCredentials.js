// Credential provider for the Amplify FaceLivenessDetector.
//
// The detector streams video straight from the browser to the Rekognition
// streaming endpoint (rekognition:StartFaceLivenessSession) — that can't be
// proxied through a Lambda, so it needs AWS credentials in the browser. We
// reuse the exact same portal Identity Pool provider used to invoke the
// orchestrator Lambda. The portal's CognitoAuthenticatedRole grants
// rekognition:StartFaceLivenessSession.
import { getPortalCredentialProvider, REGION } from './portalCredentials.js'

export const LIVENESS_REGION = REGION

/**
 * Returns the object accepted by `<FaceLivenessDetector config={...} />`.
 * `credentialProvider` is an async function resolving to AWS credentials.
 */
export function getLivenessConfig() {
  return { credentialProvider: getPortalCredentialProvider() }
}
