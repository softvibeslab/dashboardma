// Plain text only: escape at HTML insertion sites, or use textContent.
export const identityLabel=user=>`${user?.name||'Nombre no disponible'} · ${user?.email||'Correo no disponible'}`;
export const sessionLabel=actor=>`${identityLabel(actor)} · ${actor?.mode==='sso'?'Sesión corporativa':'Revisión local sintética'}`;
export const personLabel=(id,identities=[])=>identityLabel(identities.find(u=>u.id===id));
