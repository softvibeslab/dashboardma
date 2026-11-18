# QA · candidato V2 seguro, inferencia LLM real sobre fixture sintético

## Identificación y alcance

Worktree `/root/workspaces/dashboardma-onboarding-v2-safe-enrichment`; rama `feature/onboarding-v2-safe-enrichment`. Base desplegada descubierta y conservada: `dca1278d32fbf5c69bf487e97df807887a46d1da`. Contrato antiguo integrado como `691f3eb` conservando proyecto/búsqueda/clasificaciones. El commit final se obtiene por `git rev-parse HEAD`; no se usa el label Compose como fuente. Sin push, deploy productivo, restart de gateway, cambios a perfiles/roles/participaciones o escrituras Azure.

Evidencia reducida/sintética y logs se conservan privadamente en `/root/.local/share/dashboardma-enrichment-evidence/safe-enrichment-934d05d1/` (0700, archivos 0600). Fuentes scratch originales indicadas abajo; no hay OAuth/secretos productivos en estos artefactos. Los resultados no son una sesión corporativa ni aceptación humana.

## Comandos y resultados observados

| Comando | Resultado |
|---|---|
| `npm run check` | exit 0 |
| `npm run check:v2` | exit 0, incluye broker/launcher/smoke |
| `npm test` | 218 tests, 218 pass, 0 fail, 0 skipped |
| `npm run test:hermes` | 24 tests, 24 pass, 0 fail, 0 skipped |
| `python3 -m unittest discover -s test -p '*_test.py'` | 27 tests, OK |
| `git diff --check` | exit 0 |
| `node scripts/enrichment-synthetic-smoke.mjs --authorized-synthetic` | exit 0, inferencia upstream real + propuesta V2 versionada |
| `node scripts/enrichment-socket-container-smoke.mjs dashboardma-onboarding-v2:dca1278d32fbf5c69bf487e97df807887a46d1da` | exit 0, contenedor temporal UID/GID1000, socket readonly, HMAC200 / sin MAC401 |
| `docker compose` con las seis capas actuales + `enrichment-broker.override.yml`, `config --format json` | exit 0 con configuración sintética: SSO, staffing, public directory y project/agileNestCorp conservados, enriquecimiento false por defecto; no arrancó servicios |
| Scanner privado `v2-safe-secret-scan.py` | 23 archivos cambiados/nuevos, 2 secretos runtime comparados en memoria, 0 archivos con hallazgos; sin imprimir valores. No auditoría DLP universal |

Los unit tests no llaman proveedor. El smoke real está fuera de `npm test` y exige flag de autorización explícita. Los tests preexistentes pueden usar listeners locales efímeros; broker/app nuevos y Chromium de enriquecimiento usan Unix sockets. Se inventariaron puertos antes de levantar los temporales. No se abrió puerto de servicio persistente.

## Evidencia REAL de inferencia y commit documental

Último smoke después de imponer bubblewrap, Python `-I -S` y marker sin agente:

- Archivo original: `/root/.hermes/cache/scratch/v2-real-llm-eSpRjS/report.json`.
- `syntheticContent:true`, fixture biblioteca ficticia #900001, sin contenido #3134/clientes.
- `realProviderInference:true`, proveedor existente openai-codex, modelo fijado `gpt-6.1-sol`.
- `executionKind:stateless-llm-not-hermes-agent`.
- executionId `934d05d1-b1f8-49cc-adc3-c3178993d77d`, 2026-11-18T22:01:10.377Z → 22:01:18.527Z.
- Usage informado por proveedor: input **237**, output **323**, total **560** tokens. No se inventa coste monetario; no se dispone de un importe facturado.
- sourceHash `90332f12e14694782a51cb2c6011f2317af76968d2ed30a483ddf6b906de18ce`.
- inputHash `8e2c91e94f9c3478714d67d2aff3774f8933e9f9a550b8aee359092c27185b8b`.
- outputHash `76ad12a3664d94a186c5864617c23d5b39c4620a79305575fdae458a006fda81`.
- Readback de estado persistido: revisión **1→2**, una propuesta, fuente completa idéntica, preguntas pendientes sin resolver. Anónimo401; replay200 sin segunda inferencia. No hay publicación Azure.
- Auditoría **ejecutada dentro del sandbox** con credencial sintética: isolatedPython/noSite/hostMemoriesHidden/hermesCodeHidden/readOnlyAuth todos true. El worker real usa idéntico lanzador/flags con auth existente read-only. El montaje de la credencial del host solo pertenece al worker; no a V2.
- Se conservan `state.json` y `synthetic-provider-output.json` para inspección humana. Exactitud semántica/seguridad operacional final no se derivan solo de JSON válido.

Hubo pruebas reales anteriores fallidas: el socket del broker se cerraba a los 5 s durante inferencia; después un output estructurado con context objeto/constraints array fue correctamente rechazado. No se aceptaron como éxito. Se reprodujo RED el timeout, se corrigió separando timeout de body y deadline de inferencia, y se añadió JSON Schema estricto antes de repetir. Los fallos conservaron borrador/revisión. Otras llamadas previas sin sandbox no se presentan como prueba del aislamiento final.

## Evidencia SINTÉTICA de UI, seguridad y permisos

- Chromium/backend real, transporte de inferencia sintético, modelo `synthetic-broker-not-real-inference`. Estado `real` en este fixture **no** acredita uso de proveedor.
- Capturas de pasada enfocada original: `/root/.hermes/cache/scratch/v2-hermes-browser-i1k8WD/{desktop,mobile}.png`. Fueron cargadas e inspeccionadas: etiqueta «Enriquecimiento IA · sin agente Hermes», failed seguro después de conservar edición humana, legibilidad y hashes con wrap, sin overflow a 390px. Se corrigió también el texto heredado del importador que afirmaba inferencia Hermes desconectada y el mensaje de editor mientras genera. La última pasada queda en los logs/capturas permanentes.
- Reserva antes de llamada, replay/restart/actor/revisión, bloqueo concurrente, timeout/abort/poison, sourceHash alterado, outputHash inválido, límites input/output, MAC/política/schema/modelo alterados y salida sensible rechazados.
- Roles anónimo/lector/no asignado/expirado, Origin adverso, endpoint sin broker503. SSO cookies de tests únicamente sintéticas; no se fabricó SSO de personas reales.
- Edición humana concurrente prevalece; fallo no modifica draft/aprobaciones; nueva propuesta invalida aprobación exact-version y conserva decisiones históricas/original; preguntas humanas no quedan respondidas por IA.
- Socket compartido separado de journal700: grupo de socket710/660. Prueba **real entre host y contenedor** en `/root/.hermes/cache/scratch/v2-socket-container-jCVOWw/report.json`: UID/GID1000, signed200, unsigned401, providerCredentialsMounted=false, container network none/read-only. Inferencia del contenedor deliberadamente sintética.
- Source `azure-intake.js` no difiere de dca1278; suite conserva búsqueda/importación por proyecto y clasificación review. Cambios ajenos en los otros worktrees preservados, no incluidos.

## Límites / revisión pendiente

La prueba real es inferencia LLM **no agente Hermes**, sin herramientas/plugins/hooks/memoria. El sandbox comparte red para TLS al endpoint fijo; no hay firewall egress por dominio a nivel kernel. El broker host aún requiere servicio/supervisión y autorización productiva; el código fail-closed no concede permiso para datos operativos. OAuth singleton sin refresco/fallback en este worker: expiración bloquea hasta renovación por su propietario normal. Journal máximo100 y lock huérfano requieren recuperación explícita con escritores detenidos, no borrado automático.

No se verificó un deployment productivo nuevo, login Entra de usuario real, enriquecimiento operativo #3134, aprobación humana del contenido, IA fase4, QA software o publicación Azure. Receta con seis capas/roles/volumen + séptima de socket en `hermes-enrichment.md`. El build y smoke de imagen exacta, si se realizaron, están en `image-verification.json` privado; no se deben confundir con despliegue público.
