// Canonical activityLog — boot-time capture of user actions, network calls,
// console output and uncaught errors into a bounded in-memory ring buffer,
// plus a floating "Report a bug" widget (bottom-left) that ships the buffer
// to the portal's report-bug endpoint.
//
// Each demo calls `initActivityLog({ demo: '<slug>' })` ONCE from its entry
// point (main.jsx / main.tsx). Everything else is automatic:
//   - console.{log,info,warn,error,debug} are mirrored into the buffer
//   - window.fetch and XMLHttpRequest are wrapped (request + response meta)
//   - window.onerror / unhandledrejection are captured
//   - a global (window.__wwsoActivityLog) exposes logApi()/logAction() so
//     non-fetch transports (the shared lambdaService, SDK calls) can log too
//
// The widget is plain DOM (no React/framework coupling) so it works verbatim
// in every demo — React (JS/TS), the slideshow, drive-thru-sonic — with a
// single init line and no per-demo i18n wiring.
//
// PRIVACY: credentials are always redacted (JWTs, AWS access keys, Bearer
// tokens, cookie id tokens). Free-text payloads (prompts, responses) are kept
// but truncated. Response BODIES of fetch/XHR are never read (avoids breaking
// SSE/streaming and buffering large payloads) — only status/latency/size are
// logged; response content that matters is captured wherever the app already
// console.logs it, plus lambdaService logs its own parsed response summary.
//
// SHARED MODULE — copied verbatim into each demo's frontend/src/services/.
// Canonical source: demos/_shared-frontend/services/activityLog.js
// Sync via: demos/_shared-frontend/sync-shared.sh

const MAX_ENTRIES = 500;
const MAX_STRING = 2048; // per-field truncation cap (~2 KB)
const MAX_BODY = 16384; // response-body capture cap (~16 KB) before truncation
const GLOBAL_KEY = '__wwsoActivityLog';

// ---------------------------------------------------------------------------
// Buffer + redaction
// ---------------------------------------------------------------------------

const state = {
  installed: false,
  demo: 'unknown',
  buffer: [],
  seq: 0,
  // Guards against re-capturing our own instrumentation output.
  inSend: false,
};

// Preserve the real console before we patch it, so our own logging never
// recurses through the wrapper.
const rawConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug || console.log).bind(console),
};

const REDACTIONS = [
  // JSON Web Tokens (id/access tokens): three base64url segments.
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]'],
  // AWS access key IDs.
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]'],
  // Authorization: Bearer <token>
  [/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]'],
  // Cognito id/access/refresh token cookie values.
  [/(CognitoIdentityServiceProvider\.[^=;]*=)[^;]+/g, '$1[REDACTED]'],
  // Explicit secret-ish keys in JSON: "secretAccessKey":"...", "sessionToken":"..."
  [/("(?:secretAccessKey|sessionToken|SecretAccessKey|SessionToken|password|Authorization)"\s*:\s*")[^"]*(")/g, '$1[REDACTED]$2'],
];

function redact(str) {
  let out = str;
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub);
  return out;
}

function truncate(str) {
  if (str.length <= MAX_STRING) return str;
  return `${str.slice(0, MAX_STRING)}…[+${str.length - MAX_STRING} chars]`;
}

// Safe stringify that tolerates circular refs, Errors and large blobs.
function safeString(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      // Drop obvious binary blobs.
      if (typeof v === 'string' && v.length > MAX_STRING * 4) {
        return `[large-string ${v.length} chars]`;
      }
      return v;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

function clean(value) {
  return truncate(redact(safeString(value)));
}

function push(type, data) {
  const entry = {
    seq: ++state.seq,
    t: new Date().toISOString(),
    type,
    ...data,
  };
  state.buffer.push(entry);
  if (state.buffer.length > MAX_ENTRIES) {
    state.buffer.splice(0, state.buffer.length - MAX_ENTRIES);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Public logging API (used via the window global by lambdaService etc.)
// ---------------------------------------------------------------------------

export function logAction(name, detail) {
  push('action', { name: String(name).slice(0, 128), detail: detail == null ? undefined : clean(detail) });
}

// Structured API entry for transports that don't go through fetch (the shared
// lambdaService uses the AWS SDK / SigV4). `summary` may be the parsed
// response or an error — it gets redacted + truncated.
export function logApi({ transport, action, target, ms, ok, status, request, response, error } = {}) {
  push('api', {
    transport: transport || 'lambda',
    action,
    target,
    ms,
    ok,
    status,
    request: request === undefined ? undefined : clean(request),
    response: response === undefined ? undefined : clean(response),
    error: error === undefined ? undefined : clean(error),
  });
}

export function getBuffer() {
  return state.buffer.slice();
}

export function clearBuffer() {
  state.buffer.length = 0;
}

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

function installConsole() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    const original = rawConsole[level];
    console[level] = (...args) => {
      try {
        push('console', {
          level,
          message: truncate(redact(args.map(safeString).join(' '))),
        });
      } catch {
        /* never let logging break the app */
      }
      original(...args);
    };
  }
}

// Track URLs we must not capture recursively (our own report POST). The
// tracking endpoint IS captured (it's useful signal) but flagged.
function classifyUrl(url) {
  const u = String(url || '');
  if (state.reportUrl && u.startsWith(state.reportUrl)) return 'self';
  return 'external';
}

// Decide whether it's safe to read a response body for logging. We only read
// small, non-streaming, textual/JSON payloads — never event-streams or large
// binary blobs — so we never break SSE or buffer huge downloads.
function bodyIsCaptureable(res) {
  try {
    const h = res.headers;
    if (!h || !h.get) return false;
    const ct = (h.get('content-type') || '').toLowerCase();
    if (ct.includes('event-stream')) return false;
    if (!(ct.includes('json') || ct.includes('text') || ct === '')) return false;
    const len = parseInt(h.get('content-length') || '0', 10);
    if (len && len > MAX_BODY) return false;
    return true;
  } catch {
    return false;
  }
}

// Read a clone of the response in the background and attach the (redacted,
// truncated) body to the already-pushed log entry. Never blocks the caller
// and never throws.
function captureResponseBody(res, entry) {
  if (!bodyIsCaptureable(res)) return;
  let clone;
  try {
    clone = res.clone();
  } catch {
    return;
  }
  clone
    .text()
    .then((text) => {
      if (text) entry.response = clean(text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text);
    })
    .catch(() => {
      /* body already consumed / stream — ignore */
    });
}

function installFetch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);
  state._originalFetch = originalFetch;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
    const kind = classifyUrl(url);
    if (kind === 'self' || state.inSend) {
      return originalFetch(input, init);
    }
    const started = Date.now();
    let reqBody;
    if (init && typeof init.body === 'string') reqBody = clean(init.body);
    try {
      const res = await originalFetch(input, init);
      const entry = push('fetch', {
        method,
        url: redact(String(url)).slice(0, 512),
        status: res.status,
        ok: res.ok,
        ms: Date.now() - started,
        request: reqBody,
        length: res.headers && res.headers.get ? res.headers.get('content-length') || undefined : undefined,
      });
      // Capture the response body (small JSON/text only, streamed in the
      // background) so API returns land in the buffer too.
      captureResponseBody(res, entry);
      return res;
    } catch (err) {
      push('fetch', {
        method,
        url: redact(String(url)).slice(0, 512),
        ok: false,
        ms: Date.now() - started,
        request: reqBody,
        error: clean(err),
      });
      throw err;
    }
  };
}

function installXHR() {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest !== 'function') return;
  const XHR = window.XMLHttpRequest;
  const open = XHR.prototype.open;
  const send = XHR.prototype.send;
  XHR.prototype.open = function (method, url, ...rest) {
    this.__wwso = { method: String(method || 'GET').toUpperCase(), url: String(url || ''), started: 0 };
    return open.call(this, method, url, ...rest);
  };
  XHR.prototype.send = function (body) {
    const meta = this.__wwso;
    if (meta && classifyUrl(meta.url) !== 'self') {
      meta.started = Date.now();
      this.addEventListener('loadend', () => {
        let response;
        try {
          const rt = this.responseType;
          if ((rt === '' || rt === 'text') && typeof this.responseText === 'string' && this.responseText) {
            response = clean(this.responseText.length > MAX_BODY ? this.responseText.slice(0, MAX_BODY) : this.responseText);
          }
        } catch {
          /* opaque / unreadable response — ignore */
        }
        push('xhr', {
          method: meta.method,
          url: redact(meta.url).slice(0, 512),
          status: this.status,
          ok: this.status >= 200 && this.status < 400,
          ms: Date.now() - meta.started,
          request: typeof body === 'string' ? clean(body) : (body ? '[non-string body]' : undefined),
          response,
        });
      });
    }
    return send.call(this, body);
  };
}

function installErrors() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    push('error', {
      message: clean(e && (e.message || e.error)),
      source: e && e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    push('error', { message: clean(e && (e.reason || 'unhandledrejection')), source: 'unhandledrejection' });
  });
}

// ---------------------------------------------------------------------------
// Report sending
// ---------------------------------------------------------------------------

function readIdToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';').map((c) => c.trim());
  const m = cookies.find((c) => c.startsWith('CognitoIdentityServiceProvider.') && c.includes('.idToken='));
  if (!m) return null;
  return decodeURIComponent(m.split('=').slice(1).join('='));
}

async function sendReport({ description, reporterEmail }) {
  const base = (import.meta.env.VITE_PORTAL_TRACKING_API_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('report endpoint not configured');
  state.reportUrl = `${base}/report-bug`;
  const token = readIdToken();
  if (!token) throw new Error('portal session not found');

  const payload = {
    demo: state.demo,
    description: String(description || '').slice(0, 4000),
    reporterEmail: String(reporterEmail || '').slice(0, 256),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    at: new Date().toISOString(),
    log: getBuffer(),
  };

  state.inSend = true;
  try {
    const fetchImpl = state._originalFetch || fetch;
    const res = await fetchImpl(state.reportUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`report failed (${res.status})`);
    return true;
  } finally {
    state.inSend = false;
  }
}

// ---------------------------------------------------------------------------
// Floating widget (plain DOM, i18n via lang cookie)
// ---------------------------------------------------------------------------

const STRINGS = {
  en: {
    button: 'Report a bug',
    title: 'Report a bug',
    intro: 'Describe what went wrong. Recent actions, API calls and console logs from this session are attached automatically.',
    descLabel: 'What happened?',
    descPh: 'e.g. clicked Run on scenario X and got an error…',
    emailLabel: 'Your email (optional, for follow-up)',
    events: 'events attached',
    send: 'Send report',
    sending: 'Sending…',
    cancel: 'Cancel',
    ok: 'Report sent. Thank you!',
    err: 'Could not send the report. Please try again.',
    required: 'Please describe the problem first.',
  },
  pt: {
    button: 'Reportar bug',
    title: 'Reportar um bug',
    intro: 'Descreva o que deu errado. As ações recentes, chamadas de API e logs do console desta sessão são anexados automaticamente.',
    descLabel: 'O que aconteceu?',
    descPh: 'ex.: cliquei em Run no cenário X e deu erro…',
    emailLabel: 'Seu email (opcional, para retorno)',
    events: 'eventos anexados',
    send: 'Enviar relatório',
    sending: 'Enviando…',
    cancel: 'Cancelar',
    ok: 'Relatório enviado. Obrigado!',
    err: 'Não foi possível enviar o relatório. Tente novamente.',
    required: 'Descreva o problema primeiro.',
  },
  es: {
    button: 'Reportar un error',
    title: 'Reportar un error',
    intro: 'Describe qué salió mal. Las acciones recientes, llamadas a la API y logs de consola de esta sesión se adjuntan automáticamente.',
    descLabel: '¿Qué pasó?',
    descPh: 'p. ej.: hice clic en Run en el escenario X y dio error…',
    emailLabel: 'Tu email (opcional, para seguimiento)',
    events: 'eventos adjuntos',
    send: 'Enviar reporte',
    sending: 'Enviando…',
    cancel: 'Cancelar',
    ok: 'Reporte enviado. ¡Gracias!',
    err: 'No se pudo enviar el reporte. Inténtalo de nuevo.',
    required: 'Describe el problema primero.',
  },
};

function currentLang() {
  if (typeof document === 'undefined') return 'en';
  const m = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('lang='));
  const v = m ? m.split('=')[1] : '';
  return STRINGS[v] ? v : 'en';
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (props.style) node.setAttribute('style', props.style);
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function mountWidget() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('wwso-report-bug')) return;

  const mount = () => {
    const t = STRINGS[currentLang()];

    const btn = el('button', {
      id: 'wwso-report-bug',
      title: t.button,
      style: [
        'position:fixed', 'left:16px', 'bottom:16px', 'z-index:2147483000',
        'display:inline-flex', 'align-items:center', 'gap:8px',
        'padding:10px 14px', 'border:none', 'border-radius:999px',
        'background:#161c2c', 'color:#fff', 'font:600 13px/1 system-ui,sans-serif',
        'box-shadow:0 4px 16px rgba(0,0,0,.35)', 'cursor:pointer',
      ].join(';'),
    });
    btn.innerHTML = '<span aria-hidden="true">🐞</span>';
    btn.appendChild(document.createTextNode(t.button));

    btn.addEventListener('click', () => openModal(t));
    document.body.appendChild(btn);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

function openModal(t) {
  const existing = document.getElementById('wwso-report-modal');
  if (existing) existing.remove();

  const overlay = el('div', {
    id: 'wwso-report-modal',
    style: [
      'position:fixed', 'inset:0', 'z-index:2147483001',
      'background:rgba(0,0,0,.55)', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:16px',
    ].join(';'),
  });

  const card = el('div', {
    style: [
      'width:min(520px,100%)', 'background:#0f1420', 'color:#e8ecf4',
      'border:1px solid #2a3350', 'border-radius:14px', 'padding:20px',
      'font:14px/1.5 system-ui,sans-serif', 'box-shadow:0 20px 60px rgba(0,0,0,.5)',
    ].join(';'),
  });

  const desc = el('textarea', {
    placeholder: t.descPh,
    rows: 4,
    style: 'width:100%;box-sizing:border-box;margin:6px 0 12px;padding:10px;border-radius:8px;border:1px solid #2a3350;background:#0a0e18;color:#e8ecf4;resize:vertical;',
  });
  const email = el('input', {
    type: 'email',
    style: 'width:100%;box-sizing:border-box;margin:6px 0 12px;padding:10px;border-radius:8px;border:1px solid #2a3350;background:#0a0e18;color:#e8ecf4;',
  });
  const status = el('div', { style: 'min-height:18px;margin:4px 0 12px;font-size:13px;' });

  const cancelBtn = el('button', {
    style: 'padding:9px 14px;border-radius:8px;border:1px solid #2a3350;background:transparent;color:#e8ecf4;cursor:pointer;',
  }, t.cancel);
  const sendBtn = el('button', {
    style: 'padding:9px 14px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;',
  }, t.send);

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  sendBtn.addEventListener('click', async () => {
    if (!desc.value.trim()) {
      status.textContent = t.required;
      status.style.color = '#fbbf24';
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = t.sending;
    status.textContent = '';
    try {
      await sendReport({ description: desc.value, reporterEmail: email.value });
      status.textContent = t.ok;
      status.style.color = '#34d399';
      setTimeout(() => overlay.remove(), 1400);
    } catch {
      status.textContent = t.err;
      status.style.color = '#f87171';
      sendBtn.disabled = false;
      sendBtn.textContent = t.send;
    }
  });

  const footer = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;' }, [
    el('span', { style: 'font-size:12px;color:#8b93a7;' }, `${state.buffer.length} ${t.events}`),
    el('div', { style: 'display:flex;gap:8px;' }, [cancelBtn, sendBtn]),
  ]);

  card.appendChild(el('div', { style: 'font:700 16px/1.3 system-ui,sans-serif;margin-bottom:8px;' }, t.title));
  card.appendChild(el('div', { style: 'color:#9aa3b8;font-size:13px;margin-bottom:12px;' }, t.intro));
  card.appendChild(el('label', { style: 'font-size:13px;font-weight:600;' }, t.descLabel));
  card.appendChild(desc);
  card.appendChild(el('label', { style: 'font-size:13px;font-weight:600;' }, t.emailLabel));
  card.appendChild(email);
  card.appendChild(status);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  desc.focus();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initActivityLog({ demo } = {}) {
  if (state.installed) return;
  state.installed = true;
  state.demo = demo || 'unknown';

  try { installConsole(); } catch { /* noop */ }
  try { installFetch(); } catch { /* noop */ }
  try { installXHR(); } catch { /* noop */ }
  try { installErrors(); } catch { /* noop */ }

  // Expose a global so non-fetch transports (lambdaService, SDK calls) can log
  // without importing this module (keeps rollout decoupled — logging is a
  // no-op in demos that haven't initialized the log yet).
  if (typeof window !== 'undefined') {
    window[GLOBAL_KEY] = { logApi, logAction, getBuffer, clearBuffer, demo: state.demo };
  }

  push('action', { name: 'session-start', detail: state.demo });
  mountWidget();
}

export default { initActivityLog, logAction, logApi, getBuffer, clearBuffer };
