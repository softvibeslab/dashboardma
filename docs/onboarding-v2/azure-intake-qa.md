# QA del candidato Azure intake V2

## Revisión y aislamiento

- Worktree nuevo: `/root/workspaces/dashboardma-onboarding-v2-azure-intake`.
- Branch: `feature/onboarding-v2-azure-intake`, creado desde HEAD `2ab370a8c4d301cbb0f207d2833ba4b697d29f0b` de `feature/classification-participation`.
- No se copiaron ni editaron los cambios sucios del worktree de origen: repositories.js, repo-sync-runner.js, src/store.js, test/api.test.js.
- Skills cargadas: dashboard onboarding, test-driven-development y graphify. Graphify no está instalado y no existía grafo en origen; no se instaló nada. Contratos inspeccionados directamente en model.js, server.js, app.js y tests V2 existentes.

## Ejecutado y resultado

| Verificación | Resultado | Log fuera de Git |
|---|---|---|
| `npm run check` | exit 0 | `/root/.hermes/cache/scratch/azure-intake-check.log` |
| `npm run check:v2` (incluye módulos nuevos) | exit 0 | `/root/.hermes/cache/scratch/azure-intake-check-v2.log` |
| `npm test` completo | 170 pass, 0 fail, 0 skipped | `/root/.hermes/cache/scratch/azure-intake-npm-test.log` |
| `python3 -m unittest discover -s test -p '*_test.py'` | 22 tests, OK | `/root/.hermes/cache/scratch/azure-intake-python.log` |
| Unidad/HTTP/frontend/propuesta Azure dirigidos | 9 pass, 0 fail | `/root/.hermes/cache/scratch/azure-intake-targeted-unit.log` |
| Compose base + classifications + public-directory + staffing + azure-intake, `config --quiet` | exit 0; archivos/env sintéticos, sin deploy | `/root/.hermes/cache/scratch/azure-intake-compose-check.log` |

Tests nuevos: `test/v2-azure-{intake,http,frontend,proposal,browser}.test.js`.

### Recorrido navegador con backend real sintético

Chromium real, assets reales, servidor HTTP V2 real y conector real; solo el transporte Azure devuelve fixtures sintéticos. No se intercepta la API del frontend.

- Login revisión local explícita, importar ID permitido, campos custom visibles y comentario con versión original.
- Fuente con markup malicioso queda escapada; no se crea elemento img activo.
- Versión inicial, edición humana y persistencia; cancelar reemplazo conserva la edición; aceptar crea nueva versión.
- Diff existente contiene la edición humana anterior; originales separados conservados en almacenamiento.
- Publicar Azure permanece deshabilitado; etiquetas dicen determinista / IA no ejecutada.
- Desktop 1440×1000 y móvil 390×844 sin overflow; sin excepciones JS no capturadas.
- Evidencia final: `/root/.hermes/cache/scratch/v2-azure-browser-S2YCD6/desktop.png`, `mobile.png`, `state.json` (datos sintéticos). Captura móvil inspeccionada visualmente: formulario legible, control de publicación pendiente deshabilitado y diseño conservado.

### Auth, límites y fallos

- Sesiones SSO sintéticas firmadas: no asignado 403, expirado 401, Origin hostil 403; no se llama Azure.
- RBAC sin editor/coordinator 403; anónimo 401; coordinator sin editor puede importar sin concederse permisos persistentes.
- Root Azure 401 -> 502 genérico sin cuerpo privado, sin archivo/versión local; la cola se recupera. Dos imports con revisión idéntica -> uno 200 y otro 409.
- Borrador no vacío sin confirmación -> 409; revisión obsoleta -> 409; original persiste tras guardado humano/reimport.
- URLs HTTP, host malicioso, otra org, IP, userinfo, fragmentos: rechazadas. Respuesta redirect rechazada. Solo GET con redirect:error en transporte.
- Respuestas/archivos excesivos: fallos explícitos; PDF metadata-only sin descarga; TXT fallido marcado failed.
- Continuation token repetido -> partial; comentarios paginados conservados; error hijo -> failed, no fuente fingida.
- Diez hijos máximo, sin nietos. Nombre/GUID del proyecto en relaciones canónicos a proyecto fijo.
- No hay ruta de publish; no se puede inyectar snapshot mediante acción genérica.

### Lectura real privada, no escritura Azure

Se ejecutó el conector contra el piloto autorizado con una credencial ya configurada, sin imprimir valor ni rotarla. Se verificaron padre y cuatro hijos con sus revisiones esperadas; lectura de campos completos, comentarios y relaciones. El padre no tenía comentarios ni adjuntos directos; esto no demuestra ausencia de evidencia inline ni reproducción de los defectos. Los datos del piloto no se copiaron al repositorio ni al dashboard publicado.

- Snapshot real: `/root/.hermes/cache/scratch/onboarding-v2-azure-private/pilot-3134.json` (directorio 0700, archivo 0600).
- Resultado reducido de lectura: `/root/.hermes/cache/scratch/azure-intake-live-probe.log`.
- Helper efímero: `/root/.hermes/cache/scratch/probe-v2-azure.mjs`; solo descubre credenciales existentes y hace GET; no contiene valores secretos.

## TDD y fallos observados

Logs RED fuera de Git: `/root/.hermes/cache/scratch/azure-intake-red1.log` a `azure-intake-red6.log`.

1. Conector ausente -> falló test de fuentes; implementado y GREEN.
2. Endpoint ausente -> 404 en lugar de RBAC 403; implementado y GREEN.
3. Renderer ausente -> export no disponible; implementado y GREEN.
4. Lectura real inicial no siguió hijos porque Azure usaba GUID del proyecto. No se reportó como intake completo: se añadió reproducción sintética RED, canonicalización segura y se repitió lectura real con los cuatro hijos.
5. Faltaba procedencia explícita del endpoint/revisión asociada a comentarios -> RED; agregado y GREEN.
6. Propuesta no incluía comentarios/adjuntos extraídos -> RED; incorporado texto realmente disponible y GREEN.

No hay fallos automatizados pendientes en la ejecución final. La lectura real no tuvo adjuntos extraíbles: esa ruta tiene evidencia sintética, no un caso productivo adjunto real. No hubo login Entra humano de prueba, ejecución IA, writes Azure, deploy ni pruebas sobre una publicación de este candidato.

## Revisión siguiente del responsable

1. Revisar diff del candidato y límites en `azure-intake.md`, incluida persistencia de originales completos y un único borrador activo.
2. Confirmar allowlist y credencial WIT de lectura mediante configuración privada. Mantener cinco coordinadores, todos los compose vigentes y aislamiento V1.
3. Autorizar publicación del candidato V2 por separado; verificar sesión humana, snapshot/fuentes y readback de estado local.
4. Diseñar aprobación de versión exacta + publicación Azure/readback como siguiente incremento; no habilitar el botón antes de cerrar esos contratos.
