import assert from 'node:assert/strict';
import test from 'node:test';

test('session indicator distinguishes signed-in, signed-out and unconfigured states safely', async () => {
  const { sessionMarkup } = await import('../public/dashboard/session-status.js');
  const signedIn = sessionMarkup({ configured: true, authenticated: true, user: { name: '<Ana>', email: 'ana@example.com' } }, '/dashboard/requirements');
  assert.match(signedIn, /Sesión iniciada/);
  assert.match(signedIn, /&lt;Ana&gt;/);
  assert.match(signedIn, /ana@example.com/);
  assert.match(signedIn, /auth\/logout/);
  assert.doesNotMatch(signedIn, /Entrar con Azure/);
  const signedOut = sessionMarkup({ configured: true, authenticated: false }, '/dashboard/requirements');
  assert.match(signedOut, /Sin sesión/);
  assert.match(signedOut, /returnTo=%2Fdashboard%2Frequirements/);
  assert.match(sessionMarkup({ configured: false, authenticated: false }), /Autenticación no configurada/);
});
