# Ejecución y configuración V3

Continuidad preguntas → revisión exacta → plantilla SPEC → checklist de entrega: [continuity-release.md](continuity-release.md). No hay nuevas concesiones RBAC ni aprobaciones automáticas.

Requiere Node ≥20, sin dependencias npm. `npm run start:v3` arranca con SSO por defecto y falla si falta `SESSION_SECRET`: no hay bypass para facilitar pruebas.

## Variables privadas V3
- `SESSION_SECRET`: consumidor de sesión corporativa existente; conservar secreto fuera de Git.
- `V3_IDENTITY_ROLES_FILE`: JSON privado con identidades aprobadas `id`, `tid`, `oid`, `roles` y, solo si existe vínculo aprobado, `azureIdentityKey`. No deducir por correo ni conceder roles adicionales.
- `V3_PUBLIC_ORIGIN`: origen HTTPS exacto, sin ruta.
- `V3_DATA_FILE`: archivo exclusivo V3; por defecto `data/onboarding-v3/state.json`.
- `V3_BASE_PATH=/dashboard/onboarding-v3`, `V3_PORT=4193`, `V3_LISTEN_HOST=127.0.0.1` (imagen: 0.0.0.0).
- `V3_AZURE_PAT`: solo lectura WIT. `V3_AZURE_IMPORT_POLICY=project` y `V3_AZURE_ALLOWED_PROJECT=agileNestCorp`. Conector fijo MobileappsAmerica/agileNestCorp; sin URL/WIQL arbitrario. Si falta token/proyecto, falla cerrado. Política `ids` heredada solo como alternativa explícita, no elegida en receta.
- `V3_AZURE_DIRECTORY_FILE`: snapshot privado sanitizado con source `azure-devops-snapshot`, syncedAt original y users id/name/projects. Puede producirse con el exportador V2 existente desde fuente autorizada, no copiando todo el estado.
- `V3_CATALOG_SOURCE_FILE`: catálogo/proyección autorizado de solo lectura; solo fronts/participations/revision se proyectan. Sin esta variable hay catálogo local V3 independiente y vacío. No montar el volumen V2 ni su expediente completo.
- Broker opcional: `V3_HERMES_MODEL`, `V3_HERMES_BROKER_SOCKET`, `V3_HERMES_BROKER_KEY`, `V3_HERMES_AUTHORIZED=true`; sin combinación completa el botón permanece deshabilitado. Usar diseño aislado de `docs/onboarding-v2` y skill; nunca proxy de suscripción directo, credenciales de proveedor en navegador ni agente con herramientas. El compose base lo desautoriza expresamente.

## Revisión local sintética
`npm run test:v3` crea backend temporal real, identidades etiquetadas sintéticas, conector Azure con fetcher fixture y Chromium desktop/móvil. No falsifica sesiones de producción. El modo `V3_AUTH_MODE=local-review` solo se usa de forma explícita en estos tests; no modifica SSO ni roles reales.

## Recorrido
Abrir entrada V3 → buscar ID/título → seleccionar → confirmar ID/proyecto → importar. Para sustituir un borrador, marcar confirmación de reemplazo. Original y fuentes quedan desplegables separados; las preguntas se presentan primero. Responder, justificar y guardar; recargar o cerrar/reabrir recupera el servidor. «Recargar» no consulta Azure: reimportar sí. «Siguiente» abre fase 2 avanzada con las reglas de gobierno heredadas. Filtrar participantes no guarda ni otorga acceso.
