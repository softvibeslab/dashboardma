# QA V3 — candidato probado, NO publicado

## Resultados ejecutados
- `npm run check`, `npm run check:v2`, `npm run check:v3`: éxito.
- `npm test`: **223 tests, 223 pass, 0 fail, 0 skipped**, 28825.679001 ms. Log privado de ejecución: `/root/.hermes/cache/scratch/v3-final-node.log`.
- `python3 -m unittest discover -s test -p '*_test.py'`: **27 tests, OK**, 0.101 s. Log: `/root/.hermes/cache/scratch/v3-final-python.log`.
- `npm run test:v3`: **5 tests, 5 pass, 0 skipped**. Incluye dos Chromium reales contra servidor V3 real: recorrido V1 y Stage 2 avanzado; adaptador read-only, HTTP/aislamiento y consumidor SSO/RBAC sintético.
- Docker build de candidato: éxito, contexto allowlist 341.19 kB. Smoke contenedor efímero `--network none --read-only --cap-drop ALL`: **uid1000, config200, anonymousState401, page200, v3=true**. Sin host ports, montajes operativos ni servicio de producción creado.

## Cobertura y naturaleza de datos
El navegador busca, selecciona e importa el fixture Azure #17 fuera de la antigua allowlist #3134, preserva el original revision3 y campo custom, guarda respuesta/motivo a v2, recarga página real, verifica historial/diff, filtra nombre/capacidad/proyecto y prueba 1440×1000 / 390×844 sin overflow horizontal. Las preguntas se muestran antes del contexto sintético largo: primera respuesta móvil a y147.28125–217.28125 después de enfocar preguntas, viewport844. El test desktop exige primera respuesta en el viewport sin abrir fuentes enormes.

Stage 2 avanzado prueba selección gobernada, filtros, persistencia, confirmación humana sintética, cambio de proyecto y catálogo obsoleto. Auth V3 prueba anónimo401, bad Origin403, firma/expiración, tid+oid exactos, identidad sin rol403 y login local deshabilitado en SSO. El adaptador source read-only rechaza act403, proyecta sin research/audit/evidencia y deja el archivo fuente intacto. Cookie local V3 y rutas V2 fuera de prefijo404.

**Fixtures, no Azure ni SSO operativos**: backend, HTTP y Chromium son reales; respuestas del upstream Azure y personas son sintéticas. No se envió contenido de clientes al modelo. No hubo inferencia nueva, Azure write ni validación corporativa interactiva. La regresión heredada prueba contrato broker sintético, no una llamada real nueva a proveedor. La prueba real LLM previa del candidato base no se repitió.

## Evidencia visual
`desktop.png`, `mobile.png` junto a este documento: capturas solo sintéticas revisadas visualmente; preguntas legibles, guardar disponible, LLM deshabilitado con motivo, fuentes colapsadas. Dos rondas acotadas: detector señaló contraste heredado; se corrigió subtítulo y enlace primario. Avisos estéticos restantes pertenecen al mundo V1 preservado (tipografía/paleta/estilos base no usados), no acreditan auditoría WCAG completa. El botón deshabilitado usa contraste de control inactivo. No se afirma prueba funcional de todos los flujos de aprobación desde V3 browser: se hereda regresión modelo/HTTP y se ejercita Stage 2.

## Preservación V1/V2
V1 fuente HTML y CSS fueron comparados con contenedor: hashes idénticos (`f88b17b9…` HTML, `741550d7…` CSS). Compose label/mount confirmaron origen `/root/workspaces/mobilityapps-dashboard-control-tower`; no se asumió Git. V1 continúa running y su HTML local devuelve200; el contenedor no define Healthcheck (no afirmar healthy por inferencia). V2 permanece healthy en imagen dca1278d32fbf5c69bf487e97df807887a46d1da. Sus cuatro archivos dirty ajenos no se modificaron. Base safe-enrichment permanece limpia.

## Límites abiertos
No publicación/routing, no configuración runtime real V3, no catálogo/personas inventados, no migración automática, no bandeja multi-expediente. Fases2–7 usan superficie avanzada V2, no adaptación visual completa V1. Snapshot/recarga no es live-sync. Publicación Azure, carga/capacidad y OCR siguen pendientes. Docker emite aviso heurístico SecretsUsedInArgOrEnv por el nombre `V3_AUTH_MODE`; su valor `sso` no es secreto y el Dockerfile no contiene claves.

## Inspección de arquitectura
Graphify estructural acotado a los diez módulos backend heredados: 99 nodos/220 aristas/7 comunidades; no semántica ni corpus de clientes enviado a LLM. Artefacto generado movido a scratch para no ensuciar módulos V2. No se afirma análisis semántico total del repositorio.
