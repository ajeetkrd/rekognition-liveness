// Resolve the "back to portal" target URL.
//
// Each demo ships as its own bundle under /demos/<slug>/, launched from a
// portal catalog page (e.g. /demos/agentic-ai/multi-agent). A hard-coded
// href="/" always dumped the user on the portal landing page instead of the
// catalog page they came from. This reads document.referrer (the browser
// already sends the launching portal URL, same-origin) and returns its path
// so "back" lands on the exact page the demo was opened from. Falls back to
// the portal catalog (/demos) when the referrer is missing (e.g. the demo
// tab was refreshed or deep-linked) or points back into this demo's bundle.
//
// SHARED MODULE — copied verbatim into each demo's frontend/src/services/.
// Canonical source: demos/_shared-frontend/services/portalReturn.js
// Sync via: demos/_shared-frontend/sync-shared.sh

const PORTAL_FALLBACK = "/demos";

export function portalReturnUrl() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return PORTAL_FALLBACK;
  }

  const ref = document.referrer;
  if (!ref) return PORTAL_FALLBACK;

  try {
    const url = new URL(ref, window.location.origin);
    if (url.origin !== window.location.origin) return PORTAL_FALLBACK;

    // This demo's own bundle root, e.g. /demos/media-contracts/. If the
    // referrer points inside it (internal navigation, reload), ignore it and
    // fall back to the catalog rather than looping within the demo.
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments[0] === "demos" && segments[1]) {
      const demoBase = `/demos/${segments[1]}/`;
      if (url.pathname.startsWith(demoBase)) return PORTAL_FALLBACK;
    }

    return url.pathname + url.search + url.hash;
  } catch {
    return PORTAL_FALLBACK;
  }
}
