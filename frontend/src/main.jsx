import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'
import { initActivityLog } from './services/activityLog.js'
import '@aws-amplify/ui-react/styles.css'
import './styles.css'

// Recover from stale-bundle errors: after a redeploy the hashed chunk names
// change, so a tab that loaded the previous build 404s when it lazily imports
// a chunk (e.g. the AWS SDK's cognito-identity chunk on the first Lambda call)
// — "Failed to fetch dynamically imported module". Reload once (throttled, to
// avoid loops) to pick up the fresh no-cache index.html + new chunk hashes.
function recoverFromStaleChunk() {
  const KEY = 'wwso_chunk_reload_at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 15000) return // already reloaded recently — give up
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
}
const CHUNK_ERR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
// Vite fires this for its own preload-helper-wrapped dynamic imports.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault?.()
  recoverFromStaleChunk()
})
// Fallback: catch the rejection from a raw dynamic import() that 404s.
window.addEventListener('unhandledrejection', (e) => {
  if (CHUNK_ERR.test(String(e?.reason?.message || e?.reason || ''))) recoverFromStaleChunk()
})

// Capture actions, API calls, console output and errors into an in-session
// buffer and mount the floating "report a bug" widget. Must run before the
// app so fetch/console are wrapped from the first render.
initActivityLog({ demo: 'rekognition-liveness' })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
