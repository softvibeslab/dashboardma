import crypto from 'node:crypto';

const SESSION_COOKIE = 'ma_ct_session';
const STATE_COOKIE = 'ma_ct_oauth_state';
const ONE_HOUR = 60 * 60;

export function buildAuthConfig(env = process.env, overrides = {}) {
  const tenantId = overrides.tenantId || env.AZURE_TENANT_ID || '';
  const clientId = overrides.clientId || env.AZURE_CLIENT_ID || '';
  const clientSecret = overrides.clientSecret || env.AZURE_CLIENT_SECRET || '';
  const sessionSecret = overrides.sessionSecret || env.SESSION_SECRET || '';
  const redirectUri = overrides.redirectUri || env.AZURE_REDIRECT_URI || 'https://iamobilityappsinc.com/dashboard/auth/callback';
  const enabled = overrides.enabled ?? Boolean(tenantId && clientId && clientSecret && sessionSecret);
  return { tenantId, clientId, clientSecret, sessionSecret, redirectUri, enabled, tokenExchange: overrides.tokenExchange };
}

export function isAuthRoute(pathname) {
  return pathname === '/dashboard/auth/login' || pathname === '/dashboard/auth/callback' || pathname === '/dashboard/auth/logout' || pathname === '/dashboard/api/auth/status' || pathname === '/api/auth/status';
}

export function isPublicAsset(pathname) {
  return /\.(css|js|png|jpg|jpeg|svg|ico|webp|json)$/i.test(pathname);
}

export function getSession(req, config) {
  if (!config.enabled) return null;
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  return verifySignedJson(raw, config.sessionSecret);
}

export function requireAuth(req, res, url, config, sendJson) {
  if (!config.enabled) return true;
  if (url.pathname === '/api/health' || url.pathname === '/dashboard/api/health') return true;
  if (isAuthRoute(url.pathname) || isPublicAsset(url.pathname)) return true;
  const session = getSession(req, config);
  if (session) return true;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dashboard/api/')) {
    sendJson(res, 401, { error: 'Authentication required', loginUrl: '/dashboard/auth/login' });
    return false;
  }
  redirect(res, `/dashboard/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  return false;
}

export async function handleAuthRoute(req, res, url, config, sendJson) {
  if (url.pathname === '/api/auth/status' || url.pathname === '/dashboard/api/auth/status') {
    const session = getSession(req, config);
    return sendJson(res, 200, {
      configured: Boolean(config.enabled),
      authenticated: Boolean(session),
      user: session ? { name: session.name, email: session.email, oid: session.oid } : null,
      loginUrl: '/dashboard/auth/login',
      logoutUrl: '/dashboard/auth/logout'
    });
  }
  if (url.pathname === '/dashboard/auth/logout') {
    res.writeHead(302, { location: '/dashboard', 'set-cookie': clearCookie(SESSION_COOKIE) });
    return res.end();
  }
  if (!config.enabled) {
    return sendAuthSetupPage(res);
  }
  if (url.pathname === '/dashboard/auth/login') return startLogin(res, url, config);
  if (url.pathname === '/dashboard/auth/callback') return finishLogin(req, res, url, config);
  return sendJson(res, 404, { error: 'Not found' });
}

function startLogin(res, url, config) {
  const state = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(24).toString('base64url');
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const statePayload = signJson({ state, nonce, returnTo, iat: now() }, config.sessionSecret, 600);
  const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', 'openid profile email User.Read');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  res.writeHead(302, { location: authUrl.toString(), 'set-cookie': cookie(STATE_COOKIE, statePayload, 600, true) });
  res.end();
}

async function finishLogin(req, res, url, config) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(req.headers.cookie || '');
  const statePayload = verifySignedJson(cookies[STATE_COOKIE], config.sessionSecret);
  if (!code || !state || !statePayload || statePayload.state !== state) return authError(res, 'Estado OAuth inválido o expirado. Intenta iniciar sesión de nuevo.');
  let token;
  try {
    token = await exchangeCode(config, code, statePayload);
  } catch (error) {
    return authError(res, error.message || 'Azure no pudo completar el intercambio de autenticación.');
  }
  const claims = decodeJwtPayload(token.id_token);
  if (!claims || claims.aud !== config.clientId || claims.nonce !== statePayload.nonce || Number(claims.exp || 0) < now()) return authError(res, 'Token de Azure inválido.');
  const session = signJson({
    name: claims.name || claims.preferred_username || 'Azure user',
    email: claims.preferred_username || claims.email || '',
    oid: claims.oid || claims.sub || '',
    tid: claims.tid || '',
    iat: now()
  }, config.sessionSecret, 8 * ONE_HOUR);
  res.writeHead(302, {
    location: safeReturnTo(statePayload.returnTo),
    'set-cookie': [cookie(SESSION_COOKIE, session, 8 * ONE_HOUR, true), clearCookie(STATE_COOKIE)]
  });
  res.end();
}

async function exchangeCode(config, code, statePayload = {}) {
  if (config.tokenExchange) return config.tokenExchange({ code, config, statePayload });
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    scope: 'openid profile email User.Read'
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.id_token) {
    const detail = [json.error, json.error_description].filter(Boolean).join(': ');
    throw new Error(`Azure rechazó el intercambio de autenticación${detail ? ` — ${detail}` : '.'}`);
  }
  return json;
}

function sendAuthSetupPage(res) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Azure Login pendiente</title><link rel="stylesheet" href="/dashboard/styles.css"></head><body><main class="content"><section class="panel"><h1>Login con Azure pendiente de configuración</h1><p>El código de autenticación ya está instalado, pero faltan variables de entorno del App Registration.</p><ul><li>AZURE_TENANT_ID</li><li>AZURE_CLIENT_ID</li><li>AZURE_CLIENT_SECRET</li><li>SESSION_SECRET</li><li>AZURE_REDIRECT_URI=https://iamobilityappsinc.com/dashboard/auth/callback</li></ul><p>Cuando esas variables estén configuradas, la torre exigirá login automáticamente.</p><a class="primary-button" href="/dashboard">Volver al dashboard</a></section></main></body></html>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

function authError(res, message) {
  res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><html lang="es"><body><p>${escapeHtml(message)}</p><a href="/dashboard/auth/login">Reintentar</a></body></html>`);
}

function signJson(payload, secret, ttlSeconds) {
  const exp = now() + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySignedJson(value, secret) {
  if (!value || !secret || !value.includes('.')) return null;
  const [body, sig] = value.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (Number(payload.exp || 0) < now()) return null;
  return payload;
}
function decodeJwtPayload(jwt) {
  if (!jwt || jwt.split('.').length < 2) return null;
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}
function parseCookies(header) {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}
function cookie(name, value, maxAge, httpOnly = false) {
  return `${name}=${encodeURIComponent(value)}; Path=/dashboard; Max-Age=${maxAge}; SameSite=Lax; Secure${httpOnly ? '; HttpOnly' : ''}`;
}
function clearCookie(name) { return `${name}=; Path=/dashboard; Max-Age=0; SameSite=Lax; Secure; HttpOnly`; }
function redirect(res, location) { res.writeHead(302, { location }); res.end(); }
function safeReturnTo(value) { return value && value.startsWith('/dashboard') ? value : '/dashboard'; }
function now() { return Math.floor(Date.now() / 1000); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
