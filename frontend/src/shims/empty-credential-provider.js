// Browser shim for AWS SDK credential providers that are Node-only (IMDS,
// SSO/file, login, process, INI, env). We never reach them in the browser
// since fromCognitoIdentityPool always supplies credentials. Returning
// stubs keeps Rollup from choking on `node:http`, `node:fs`, etc.

const unavailable = () => async () => {
  throw new Error('Credential provider not available in browser')
}

export const fromInstanceMetadata = unavailable
export const fromContainerMetadata = unavailable
export const fromTokenFile = unavailable
export const fromProcess = unavailable
export const fromSSO = unavailable
export const fromSso = unavailable
export const fromIni = unavailable
export const fromEnv = unavailable
export const fromHttp = unavailable
export const fromLogin = unavailable
export const fromLoginCredentials = unavailable
export const fromWebToken = unavailable
export const fromNodeProviderChain = unavailable
export const defaultProvider = unavailable
export const nodeAttributeProvider = unavailable
export const checkUrl = () => true

export const httpRequest = async () => {
  throw new Error('IMDS httpRequest not available in browser')
}
export const providerConfigFromInit = (init) => init || {}
export const RemoteProviderInit = {}

export const nodeProvider = unavailable
export const nodeDefaultProvider = unavailable

export const fromStatic = unavailable
export const nodeProviderChain = unavailable

export default {}
