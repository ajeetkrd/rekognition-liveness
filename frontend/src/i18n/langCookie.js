// Persist the user's language preference across page loads.
const KEY = 'wwso_lang'

export function readLang() {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

export function writeLang(code) {
  if (typeof document === 'undefined') return
  // 1 year, root path so the portal + every demo share it.
  document.cookie = `${KEY}=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`
}
