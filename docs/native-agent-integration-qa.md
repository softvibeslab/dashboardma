# QA — candidato unido preguntas + Hermes nativo

## Integración exacta

- Rama destino: `feature/onboarding-v3-hermes-agent-bridge`, partiendo del bridge `1480139040d42a939149abb60ba0c4e5f0c7e0c5`.
- Segundo padre del merge: preguntas `5b19929fe16568ee1bb07c0a6089d62c1678e333`.
- Los conflictos de `public/onboarding-v3/app.js` y `src/onboarding-v3/server.js` se resolvieron inicialmente con las versiones de preguntas: no había cambios bridge propios en esos archivos. Después se añadió el bootstrap nativo opt-in y la trazabilidad visual. No se modificó el worktree que se despliega.
- Identidad `src/onboarding-v3/identity.js` y `public/onboarding-v3/identity.js` se mantienen sin diff respecto a `5b19929`. El linaje contiene ambos commits equivalentes de identidad; no se vuelve a aplicar ni duplicar su implementación.
- No se instalaron servicios, no se desplegó V3, no se modificó el broker/worker vivo ni roles. Cualquier aprobación de publicación posterior sigue requiriendo corpus/bindings y gates operativos de `native-agent-publication.md`.

## TDD y oráculos

Se observaron fallos RED para disponibilidad de preguntas, proyección/contrato `question`, denegación de historial no vacío, ausencia de renderer de herramientas, ausencia de selector de arranque, falta de soporte de socket compartido/reinicio y replay con el mismo executionId cambiando contextKey. Se implementó cada comportamiento y se verificó GREEN. Los tests de descriptores son fixtures de protocolo explícitos; no se atribuyen llamadas de proveedor a ellos.

| Área | Oráculo |
|---|---|
| 8 refs máximo, exclusión de texto/adjuntos no seleccionados, baseline e instrucciones acotadas | `test/v3-agent-question.test.js` |
| Reutilización de questionHash/schema; alternativa no aplicada; stale preserves human answer | Mismo test + safety/HTTP de la rama de preguntas |
| HTTP, milestones durables, repeat/conflict, deepen con baseline actualizado, cero decisiones automáticas | `test/v3-agent-question-http.test.js` |
| Native loop, tools y sandbox reales por Unix; summary/enrich/question con modelo determinista y cero proveedor | Mismo test HTTP + `test-support/test_v3_agent_boundary.py` |
| Historial de pregunta vacío incluso con sesión envenenada; separación de ledger y contexto | Test Python; el adapter exige el recuento observado `historyMessages=0` |
| Proveedor real vs fixture, schemas/purposes, única herramienta, no-history policy | `test/v3-agent-readiness.test.js`, tests bridge; fixture nunca activa bootstrap de producción |
| Motor anterior conservado hasta readiness completo; sin inferencia al arrancar ni retries entre motores | `test/v3-agent-startup.test.js` |
| Unix compartido 0710/0660 sin exponer DB 0700/0600, lock único, stale socket y SIGTERM/reinicio | Test Python del supervisor |
| Nombre del motor, progreso y herramientas/fuentes reales observadas; incorporar no guarda/aprueba | `test/v3-agent-question-browser.test.js`, Chromium real con backend y mediador reales |
| Render de metadata escapada; ningún reasoning | `test/v3-agent-question-ui.test.js` |
| Identidad, preguntas legacy, filtros/polling, reviewer independiente, SPEC, summary/enrich, V1/V2 | Regresión Node/Python completa en serie |

El navegador nuevo se ejecutó con corpus exclusivamente sintético y generó `desktop.png`, `mobile.png` y `tools.json` bajo `$TMPDIR/native-question-browser-*`. Se inspeccionaron ambas capturas: etiqueta de modelo sintético y herramienta/fuentes/hash legibles, sin solapamiento ni overflow horizontal; hash largo envuelto en móvil. No se simularon respuestas HTTP del backend ni tool calls del agente en ese E2E: el modelo determinista eligió la herramienta y `AIAgent` la ejecutó en bwrap. `tools.json` conserva `modelMode=deterministic-fixture`, `providerRequests=0` y eventos efectivamente verificados.

## Reproducción serial y archivo limpio

```sh
npm run check
npm run check:v3
node --test --test-concurrency=1
python3 -m unittest discover -s test -p '*_test.py'
python3 test-support/test_v3_agent_boundary.py
python3 scripts/v3-hermes-agent-probe.py --audit
```

El runner de entrega registra SHA y salidas reales fuera de Git, crea un archivo con `git archive <SHA>` y repite desde él las suites completas en serie. No usa node_modules, ficheros no versionados, estado productivo o memorias del worktree para completar el artefacto. El runtime Hermes fijado es una dependencia externa explícita del supervisor y debe existir en el host; el archivo no pretende contenerlo.

Los totales definitivos, paths de logs, SHA de archivo/commit y comprobación `ls-remote` se adjuntan en el recibo de entrega externo, no se inventan aquí antes de ejecutar la regresión. Los resultados del incremento anterior (33 Node / 3 Python) no son los totales del merge. Se conserva la evidencia de la única prueba sintética de proveedor real anterior en `docs/evidence/onboarding-v3-agent-real-probe.json`; **este incremento no ejecuta nuevas llamadas pagadas ni IA sobre clientes**.

## Gates todavía operativos, no defectos ocultos de compatibilidad

- Manifiesto operativo minimizado de proyectos/fuentes aprobadas y bindings de actores/snapshots concretos: no aprovisionado por estas pruebas. No hay promesa de todos los proyectos indexados.
- Usuario/grupo/mounts/unit nuevos y sus hashes, backup inmediato vigente, publicación secuencial de V3, SSO humano y verificación pública del parent: no ejecutados desde esta rama.
- No cambiar la etiqueta del motor vivo a agente sin readiness real y una ejecución de herramientas observada. El bootstrap deja el LLM vigente seleccionado si el gate no se cumple.
