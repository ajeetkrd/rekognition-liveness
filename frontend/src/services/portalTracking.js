// Portal tracking client. Fire-and-forget — never throws to callers.
// Server (Lambda) extracts userAlias/email/name from the JWT bearer.
//
// Contract: docs/TRACKING.md in the monorepo root.

const TRACKING_URL = (
  import.meta.env.VITE_PORTAL_TRACKING_API_URL || ''
).replace(/\/$/, '');

const DEMO_SLUG = 'rekognition-liveness';

const COOKIE_PREFIX = 'CognitoIdentityServiceProvider.';

function readIdToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';').map((c) => c.trim());
  const m = cookies.find(
    (c) => c.startsWith(COOKIE_PREFIX) && c.includes('.idToken=')
  );
  if (!m) return null;
  return decodeURIComponent(m.split('=').slice(1).join('='));
}

// The active scenario the user is currently in. The portal Usage Report shows
// `scenario` as a first-class column, but outcome events like `prompt-executed`
// don't carry the scenario in their metadata. We remember the last-opened
// scenario here and attach it to every event so those rows are attributed to
// the right scenario. Set it from the same place that emits `scenario-opened`.
let activeScenario = '';

export function setActiveScenario(slug) {
  activeScenario = typeof slug === 'string' ? slug : '';
}

export function trackPortalEvent({ feature, eventType, metadata, path, scenario } = {}) {
  if (!TRACKING_URL) return;
  const token = readIdToken();
  if (!token) return;
  const body = JSON.stringify({
    demo: DEMO_SLUG,
    feature,
    eventType,
    scenario: scenario || activeScenario || undefined,
    metadata,
    path:
      path ??
      (typeof window !== 'undefined' ? window.location.pathname : undefined),
  });
  void fetch(`${TRACKING_URL}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch((err) => {
    console.warn('Portal tracking failed:', err);
  });
}
