# QA · enriquecimiento Hermes V2 (candidato local)

**Estado:** adapter/contrato fail-closed implementado y verificado; inferencia real **BLOQUEADA**. No desplegado ni enviado a remoto. Base: `7d2b5f2156c31895e2955f3088c58d59b5af3aea`. Branch: `feature/onboarding-v2-hermes-enrichment`. Worktree nuevo: `/root/workspaces/dashboardma-onboarding-v2-hermes-enrichment`.

## Ejecución observada

Entorno de esta verificación: Node `v24.17.0`, Python `3.14.9`, Chromium instalado. No se afirma ejecución con Node 22 ni Python de otra versión.

| Comando | Resultado real | Log privado |
|---|---|---|
| `npm run check` | exit 0 | `/root/.hermes/cache/scratch/v2-hermes-check.log` |
| `npm run check:v2` | exit 0, incluye ambos módulos nuevos | mismo log |
| `npm test` | **182 tests, 182 pass, 0 fail, 0 skipped**, 27890.333561 ms | `/root/.hermes/cache/scratch/v2-hermes-full-node.log` |
| `npm run test:hermes` | **12 tests, 12 pass, 0 fail, 0 skipped**, 27390.200206 ms | `/root/.hermes/cache/scratch/v2-hermes-focused-node.log` |
| `python3 -m unittest discover -s test -p '*_test.py'` | **22 tests, OK**, 0.031 s | `/root/.hermes/cache/scratch/v2-hermes-full-python.log` |
| `git diff --check` | exit 0 | salida de herramienta vacía, sin errores |

### Browser real, datos e inferencia sintéticos

Prueba Chromium nueva sobre **socket Unix**, sin puerto TCP del nuevo backend. CDP puentea peticiones y respuestas al `http.Server` real; no devuelve fixtures HTTP. La inferencia sí es un transporte sintético deliberado, modelo `synthetic-broker-not-real-inference`. El estado `real` observado comprueba el contrato de éxito, **no es prueba de inferencia real**.

- Evidencia del full suite: `/root/.hermes/cache/scratch/v2-hermes-browser-OzwEMo/`.
- Evidencia del suite enfocado: `/root/.hermes/cache/scratch/v2-hermes-browser-Go8r2c/`.
- Cada directorio conserva `desktop.png`, `mobile.png`, estado sintético y catálogo; el perfil Chromium se elimina al terminar.
- Verifica in-progress → éxito, nueva versión, edición humana, comparación con original/versión previa, fallo de inferencia sin reemplazar borrador, no exposición de error privado, publicación Azure deshabilitada y sin overflow a 390 px.
- Las pruebas previas incluidas en `npm test` siguen usando sus listeners efímeros locales de test. No se abrió ningún puerto de servicio nuevo ni persistente; los nuevos tests usan sockets Unix.

### Seguridad/contratos ejercitados

- Anónimo/expirado 401, no asignado/lector 403, Origin adverso 403, revisión obsoleta 409, sin llamadas al broker.
- Sin broker: 503 y archivo de estado idéntico. No hay fallback a provider, CLI o gateway.
- ID de ejecución estable: una llamada por reserva; repetición terminal no reintenta; actor/revisión distinta bloqueados. Reserva huérfana tras restart falla sin retry.
- Solo una generación; límite global 45 s y cancelación del transporte (prueba acelerada 20 ms); límite de bytes/tokens del contrato y salida acotada.
- Fuente corrupta o alterada bloqueada; intento de instrucciones de fuente se mantiene como texto de datos; identidades estructuradas no se proyectan.
- Patrones sensibles en entrada/salida bloqueados; esquema de salida no admite aprobación/owners/QA. Hash alterado falla antes de aplicar.
- MAC inválido, toolsExecuted no cero, binding incorrecto y exceso de tamaño de response rechazados sobre transporte de socket real.
- Edición de otro cliente durante generación prevalece; salida stale no se aplica. Aprobación exact-version anterior queda invalidada, no borrada ni renovada por IA.
- Fallos y errores de almacenamiento del endpoint de generación tienen respuesta genérica; no devuelven el cuerpo upstream ni detalles privados.
- Etiquetas del paquete diferencian enriquecimiento fase 1 de IA de consistencia fase 4 no ejecutada.

### Escaneo de secretos

Scanner reproducible, sin dependencias instaladas: `/root/.hermes/cache/scratch/check-v2-hermes-secrets.py`. Resultado final privado: `/root/.hermes/cache/scratch/v2-hermes-secrets.json`.

Resultado observado: **13 archivos escaneados, 0 hallazgos**, comparación con **1** secreto del entorno y **7** coincidencias sintéticas/no secretas explícitamente revisadas. Exit 0.

Alcance: archivos modificados/nuevos del candidato, patrones de private keys/provider keys/JWT/assignments literales y comparación exacta con secretos ya presentes en el entorno del proceso. No se leen pools de auth ni archivos OAuth de personas. Las coincidencias sintéticas y dos falsos positivos revisados (clave de sessionStorage e identidad de prueba) están allowlisted de forma explícita; no hay exención general para tests. No sustituye una auditoría DLP integral ni prueba ausencia universal de secretos.

## Qué no se verificó

- **Ninguna inferencia real** ni coste de proveedor: falta broker especializado autenticado/aislado/autorizado; ver `hermes-enrichment.md`.
- No se leyó/envió el snapshot privado del piloto a un modelo, no se fabricó una respuesta IA para él y no se escribió en producción/Azure.
- Ninguna sesión corporativa real. Las cookies SSO de tests pertenecen solo a tenant/oid/secret sintéticos; no se fabricaron cookies de usuarios reales.
- No se modificaron perfiles/gateways/credenciales de personas ni configuración productiva.
- No push, deploy, restart, instalación de paquetes/servicios ni activación de publicación Azure.

Pendiente del responsable padre: revisión del candidato y del contrato, decisión/implementación autorizada del broker, piloto bounded fuera de producción, revisión humana y publicación separada si se autoriza.
