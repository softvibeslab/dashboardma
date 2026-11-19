# V3 — continuidad CP1 → SPEC CP2 → preparación CP3

## Gap assessment y alcance

La base desplegada `78522be3df982652a4f7e3a4a6dbe2360bbb27eb` ya tenía preguntas/respuestas versionadas, fuentes originales separadas, secciones/criterios manuales, revisor documental, decisiones por objeto/hash y paquete/recepción. Faltaban el siguiente paso visible, revisión específica del contexto exacto y procedencia entre ese contexto y una plantilla SPEC. Se reutilizan estos mecanismos; no se crea un motor alternativo de aprobaciones ni se renombran las siete fases como CP.

El incremento añade `src/onboarding-v3/continuity.js` y el panel compartido `public/onboarding-v3/continuity.js`, sin modificar el modelo V2 ni el broker. «Contexto CP1 · Revisado» es revisión de contexto, no CP1 aprobado. «SPEC CP2 · Generado» es plantilla, no especificación completa ni aprobación CP2. CP3 conserva el significado Dev (ramas/PR/unitarias), que onboarding no ejecuta.

## Recorrido funcional

1. Entrada `/dashboard/onboarding-v3/`: importar o abrir contexto existente → «Ver preguntas y responder» enfoca respuestas existentes → guardar. No se ejecuta inferencia automáticamente.
2. «Asignación y revisión documental» abre fase 4. Se reutiliza su revisor asignado. Solo ese actor independiente, autenticado y con rol `reviewer` ya autorizado puede registrar la revisión del contexto exacto. Coordinador/editor no equivalen a reviewer. Asignar un nombre sin ese rol no concede el permiso. Sin revisor autorizado, el gate permanece explícito.
3. POST `/api/action` con `type=review-context`, revisión y hash registra actor/rol/modo/fecha/versión/hash en `contextReviews`; no agrega una decisión `approve`, no marca revisión documental ni cierra CP. El hash liga fase 1 completa, fuente original, revisor y epoch de cambios de contexto. Cambios de contexto/fuente/respuestas/revisor invalidan la revisión aunque se restaure texto anterior; los registros históricos quedan. Cambios documentales posteriores no reescriben la versión revisada.
4. Un editor solicita explícitamente «Preparar borrador SPEC CP2» (`type=prepare-spec`). Exige revisión vigente y preguntas bloqueantes respondidas con motivo. Genera una **plantilla determinista, sin LLM** con once secciones: alcance, reglas/decisiones, actores, flujos, estados, excepciones, datos, permisos, integraciones, criterios, pruebas; además una sección por frente existente. No fabrica criterios, actores, permisos ni contratos. Faltantes `PENDIENTE`; criterios trazables se completan manualmente en fase 3.
5. Si hay SPEC manual/generada, se exige confirmación de reemplazo y el modelo existente conserva texto anterior en `history`. No se permite reemplazar una SPEC con aprobación vigente. `specDrafts` conserva fuente/hash/contexto/revisión, preguntas, decisiones y hash generado. Cambios de contexto/frentes/texto invalidan la procedencia corriente; no regeneran automáticamente. Una SPEC manual/editada puede avanzar mediante revisión y aprobación por hash existentes, sin forzar reemplazo.
6. «Checklist de entrega» abre fase 7; muestra artefactos/objetos/hash/aprobaciones y bloqueos existentes, incluidas vigencia del catálogo y clasificación. La revisión independiente del contexto **no depende** de tener candidatos de staffing. Sin participaciones autorizadas, selección/confirmación/entrega siguen bloqueadas, no se inventan personas.
7. GET `/api/package` conserva gates existentes y suma los de continuidad. El paquete V3 añade `provenance.json` al manifiesto/hash. Recepción usa el destinatario/validación existentes contra ese hash exacto; el recibo no cambia el paquete. No se ejecuta desarrollo, QA software, despliegue o Azure write.

## Matriz de progreso y aceptación

| Área | Implementado / probado | Readiness operacional (baseline previo a publicación) |
|---|---|---|
| CP0 Reportado Azure | Intake read-only y snapshot original existentes, preservados | Un intake real v1; ninguna importación nueva en este incremento |
| CP1 Análisis | Preguntas editables, acceso directo, revisión independiente exacta y trazabilidad | Dos preguntas existentes; cero revisiones humanas. Cinco identidades coordinator/editor, cero reviewer/qa; no se concedieron roles |
| CP2 Spec | Plantilla explícita determinista y manuales/historial preservados; once secciones + frentes | Cero plantillas reales generadas, revisión de contexto pendiente; no SPEC aprobada |
| CP3 Dev | Checklist y handoff documental con procedencia y gates existentes | Dev no ejecutado, no CP cerrado. Diez frentes de catálogo, cero participaciones/candidatos elegibles |

Los conteos del baseline son reducidos y no exponen contenido de cliente. SSO corporativo interactivo, decisiones de negocio y aprobación humana siguen pendientes. No se envió ningún snapshot operativo al modelo; no se repitió la prueba pagada.

## Pruebas y evidencia

- TDD: revisión de contexto falló por módulo ausente antes de implementarse; slice SPEC falló por acción inexistente; HTTP falló por ausencia de DTO; navegador falló por panel ausente; paquete/recepción falló antes de incorporarse. Corregidos en ciclos separados.
- `node --test --test-concurrency=1`: **232/232**, sin fallos ni skips, 312843.78508 ms (ejecución previa al ajuste final de copy/dedupe/check script; regresión V3 final posterior **14/14**, sin fallos/skips, 28298.792267 ms). `python3 -m unittest discover -s test -p '*_test.py'`: **28, OK**. `npm run check`, `check:v2`, `check:v3`: éxito.
- Seis pruebas nuevas entre `test/v3-continuity*.test.js`: modelo, HTTP Unix socket y Chromium real contra backend V3 con fixtures. Cubren 401/403, hash/revisión obsoleta409, preguntas sin resolver, no autoaccept, fuentes/manuales/historial, reemplazo explícito, aprobación existente no reemplazable, paquete/manifiesto/recibo estable, cambios que invalidan revisión/procedencia, desktop1440 y móvil390 sin overflow.
- Capturas `evidence/continuity-desktop.png` y `continuity-mobile.png`: solo fixture sintético. Inspección visual legible y sin desborde; ningún dato operativo ni sesión corporativa.
- Detector: único warning sobre borde lateral del panel de contexto **heredado**, fuera del incremento. No es certificación WCAG completa.

## Publicación aislada / límites

Build de `git archive` del commit limpio, etiqueta completa y OCI revision exacta. Mantener las tres capas Compose base+preview+enrichment, auth/roles/router/volumen/catálogo/broker existentes. Backup privado restaurable datos/runtime, tarballs0600 en directorio0700 y manifiestos verificados antes de recrear solo V3. Conservar IDs/start V1/V2 y contenidos V2; V1 tiene estado dinámico y no se congela.

Verificar HTML reescrito/assets con hashes exactos, `/api/state` anónimo401, Origin hostil403, salud/revisión de imagen, fuente y roles read-only, datos V3 sin cambios. Evidencia privada de publicación contiene readbacks exactos sin publicarlos en Git. Este documento describe candidato y protocolo; el resultado de despliegue se confirma por readbacks, no por esta receta.
