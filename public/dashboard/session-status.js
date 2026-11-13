const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function sessionMarkup(auth, returnTo = '/dashboard') {
  if (!auth.configured) return '<span>Autenticación no configurada</span>';
  if (auth.authenticated) {
    return `<span><strong>Sesión iniciada</strong> · ${escapeHtml(auth.user?.name || auth.user?.email || 'Usuario Azure')}<small>${escapeHtml(auth.user?.email || '')}</small></span><a class="ghost-link" href="/dashboard/auth/logout">Cerrar sesión</a>`;
  }
  return `<span>Sin sesión</span><a class="ghost-link" href="/dashboard/auth/login?returnTo=${escapeHtml(encodeURIComponent(returnTo))}">Entrar con Azure</a>`;
}

export async function updateSession() {
  const target = document.getElementById('sessionStatus');
  if (!target) return;
  try {
    const response = await fetch('/dashboard/api/auth/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Session unavailable');
    const auth = await response.json();
    target.innerHTML = sessionMarkup(auth, location.pathname + location.search);
    target.dataset.authenticated = String(auth.authenticated === true);
  } catch {
    target.textContent = 'No se pudo verificar la sesión. Recarga la página.';
    target.dataset.authenticated = 'false';
  }
}

if (typeof document !== 'undefined') {
  updateSession();
  window.addEventListener('focus', updateSession);
  window.addEventListener('pageshow', updateSession);
  setInterval(updateSession, 60000);
}
