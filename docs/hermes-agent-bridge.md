# V3 — puente Hermes nativo de contexto autorizado (candidato para revisión)

## Resultado y alcance exactos

Base: `0f80bfcb5c2d4bf77132d572fcbef7c53909e779`. Rama: `feature/onboarding-v3-hermes-agent-bridge`.

**Hay ejecución real de `run_agent.AIAgent`, con una herramienta ejecutada y una respuesta de proveedor real sobre una fuente exclusivamente sintética.** No es una llamada LLM renombrada Hermes. Evidencia reducida del resultado observado: [`evidence/onboarding-v3-agent-real-probe.json`](evidence/onboarding-v3-agent-real-probe.json). Se realizaron dos peticiones de proveedor para un único turno de agente: selección de herramienta y respuesta posterior a su resultado. Uso reportado: 4012 tokens de entrada, 86 de salida, 4098 totales; coste monetario no disponible. Las regresiones posteriores usan inferencia determinista explícita para evitar costes redundantes.

No está desplegado por esta rama. El candidato ahora integra cambios de `server.js` y UI para preguntas/progreso y selección por readiness; **no se modifican procesos, broker vivo, perfiles, modelos globales, gateways, memorias, hooks ni servicios existentes**. No se envían datos de clientes a IA. No se consulta Bocadeli/QueryGuard ni se añaden herramientas de consultas, escrituras Azure, aceptación, aprobación o concesión de roles.

## Ruta elegida y comprobada

Se consultaron el índice oficial `https://hermes-agent.nousresearch.com/docs/llms.txt`, las páginas oficiales [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration), [Agent Loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop) y [Tools Runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime), `hermes chat --help`, firma de `AIAgent`, resolución de herramientas y las rutas nativas de dispatch/inline. La integración Python directa está documentada; API/ACP/gateway comparten el núcleo, pero no aportan por sí solos la capacidad de lectura documental cerrada que necesita esta app.

Se usa un supervisor separado y el núcleo nativo **fijado** al commit Hermes `ae2a81ccc00e9b7c06301523e5bb09608397149c`. El snapshot de código se extrae del objeto Git de ese commit, no del árbol instalado mutable. Se detectó una modificación preexistente en `gateway/run_api.py` de la instalación y no se tocó ni se incorpora al snapshot. No se activa el dashboard ni se conecta al chat/gateway default.

```text
V3 autenticado, RBAC y revisión exacta existentes
  → HermesAgentEngine (propósito documental fijo + binding actor/snapshot)
  → HTTP privado sobre Unix socket, clave del mediador, sin credencial de proveedor
  → mediador: ACL actor/org/proyecto/expediente/sourceHash + corpus aprobado
  → bwrap: sin red, HOME vacío, código/venv read-only, sin credenciales
  → AIAgent: registro sellado + guardia anterior a herramientas inline/concurrentes
  → authorized_context({}) → solo fragmentos autorizados + fuentes comunes aprobadas
  → inferencia por IPC; supervisor agrega credencial al endpoint fijo de proveedor
  → validación de output, bindings, fuentes y tool-call IDs → propuesta, nunca aprobación
```

### Fronteras de seguridad

- `--safe-mode`, `enabled_toolsets` y prompts **no** son la frontera. El sandbox oculta `/root/.hermes` y workspaces; elimina red y capabilities. Se verifican esos hechos dentro del worker antes de ejecutarlo.
- Se eliminan todos los handlers originales del registro y se congela su tabla con `MappingProxyType`. El dispatch permite únicamente `authorized_context`. Otra guardia anterior al dispatch rechaza cualquier otro nombre o argumentos distintos de `{}`, también antes de las herramientas inline/concurrentes. El audit ejecuta denegaciones de terminal, lectura/escritura, código, memoria, recall, delegación, búsqueda web, skills y llamadas genéricas.
- La herramienta no acepta rutas, comandos, URLs, SQL, IDs de otros proyectos ni peticiones de instalación. Devuelve fragmentos ya seleccionados por el mediador, no busca indiscriminadamente el host.
- El worker no ve credenciales ni acceso de red. Su único canal de inferencia es IPC. `httpx.MockTransport` se utiliza como adaptador de I/O del SDK a ese IPC, **no** como generador de respuestas en modo real: el supervisor transforma la respuesta SSE real de Responses al formato chat-completions del núcleo, conservando texto, llamadas e ID de proveedor. Solo el modo fixture sintetiza respuestas y se identifica como `deterministic-fixture`. El supervisor no reenvía URL/modelo/headers/tools elegidos por el cliente: reconstruye un modelo y endpoint fijos y una sola función sin parámetros. Nunca se pasa una credencial de proveedor a la app o al agente.
- La credencial existente solo se lee en el supervisor para el probe autorizado; no se refresca, rota, copia o modifica. Si está ausente o expirada, falla cerrado. La preparación de credenciales/usuario/servicio definitivo queda para aprobación del operador.
- Los fragmentos son datos no confiables, no instrucciones. Las citas prueban procedencia, **no entailment**. La revisión humana sigue siendo obligatoria.
- La confianza en binarios/dependencias del operador, sistema/kernel y código del mediador sigue siendo necesaria. Esto no es una atestación remota ni protección frente a un administrador host malicioso. Revisar la rama antes de publicar el servicio.

## Corpus, Graphify y sincronización de conocimiento

No existe un índice Graphify del proyecto en este worktree. No se ejecutó ni se inventó una consulta Graphify. Se admite `kind: graphify` como **exportación revisada**, con el mismo aislamiento que un fragmento de repositorio. No se recorre un Graphify global, ni memorias privadas de Hermes, ni todos los repositorios por defecto.

El manifiesto privado del operador contiene exactamente `grants` y `sources`:

- `grants`: filas exactas `{actor, org, project, caseId, sourceHash}`. `sourceHash` autoriza una versión concreta del snapshot ya guardado. Son capacidades de este mediador, no concesiones de roles RBAC/Azure.
- `sources`: filas exactas `{id, org, project, kind, ref, text}`. `kind` es `repository`, `graphify` o `ecosystem`; `ref` es SHA Git completo o fecha UTC ISO `YYYY-MM-DDTHH:MM:SSZ`. Solo las fuentes de `org: synthetic` pueden usar referencias `fixture-*`.
- El contenido común tiene **a la vez** `org: common`, `project: ecosystem`, `kind: ecosystem`. Esa clasificación requiere revisión del operador para asegurar que no incluye secretos ni contexto privado de un cliente. Un documento de cliente nunca se convierte en común por pedir «todos proyectos».
- Máximo 100 fuentes, 8000 caracteres por fuente y 24 KB recuperados por ejecución. IDs duplicados y patrones de credenciales conocidos se rechazan. Ese escáner no sustituye revisión de PII, secretos y clasificación.

Procedimiento reutilizable de publicación de conocimiento:

1. Elegir organización/proyecto/work item y actores autorizados; fijar `sourceHash` del snapshot. Nada de permisos derivados del prompt o correo.
2. Exportar **fuera del agente** únicamente fragmentos aprobados de repositorio/Graphify, preservando ruta/localización en `id`, SHA o fecha en `ref` y clasificación. No ejecutar indexación semántica de clientes sin autorización.
3. Separar materiales comunes de los privados. Revisar contenido y metadatos antes de publicar manifiesto privado mode `0600`.
4. Hacer que `scopeResolverFromBindings(manifest.grants)` resuelva el binding por actor autenticado y snapshot persistido; el mediador comprueba nuevamente la misma fila. Cada versión importada necesita su binding revisado.
5. Actualizar el manifiesto mediante revisión controlada y reiniciar **solo el nuevo mediador**, cuando se autorice. No hay watcher, hooks globales o sincronización automática. El manifiesto se captura al arrancar.
6. El cambio de contenido/ref/hash crea otra clave de sesión. Revocar el grant impide incluso replay de un resultado previo. Un proyecto sin fuentes autorizadas falla `project-not-indexed`; fuentes comunes solas no autorizan otros proyectos.

No se promete «conocimiento mágico de todos los proyectos»: el agente debe declarar la cobertura limitada a los fragmentos indexados/autorizados. La prueba real lo hizo explícitamente.

## API mínima para integrar tras revisión

`src/onboarding-v3/hermes-agent-engine.js` exporta:

- `HermesAgentEngine`: compatible con `documentaryAI` de `createV3Server`: `model`, `engine`, `configured()`, `available(purpose)`, `preview(state,input)`, `generate(state,actor,input,progress)`.
- `nativeAgentTransport`: únicamente socket Unix absoluto + clave de mediador + autorización explícita. No permite URLs externas, modelos, comandos ni credenciales de proveedor en la app.
- `scopeResolverFromBindings`: copia bindings confiables y resuelve actor autenticado + `sourceHash`; niega ausencias y ambigüedades.
- `ContextCapability`: selector offline auxiliar probado; la ACL efectiva de ejecución también se impone en el mediador Python.

`summary`/`enrich` conservan el contrato documental y `applyDocumentary`. Las referencias externas se guardan aparte en `agentEvidence.contextCitations`; no se convierten en evidencia Azure. La evidencia incluye scope, runtime/commit, sessionId opaco, toolCallId, estado ejecutado, ID de fuente, proyecto, ref y hash. El worker valida el resultado real de la herramienta antes de añadir un evento `executed`.

El transporte rechaza que un broker determinista se anuncie como proveedor real. La generación rechaza runtime/commit, modelo, toolset, auditoría, IDs/hash, fuentes ajenas, falta de herramientas o citas inventadas. Fallar no modifica el borrador ni approvals.

Ejemplo de **wiring pendiente de revisión**, no un despliegue realizado:

```js
import {HermesAgentEngine,nativeAgentTransport,scopeResolverFromBindings}
  from './hermes-agent-engine.js';
// operatorManifest y mediatorKey llegan del backend, fuera de Git/public/ y sin provider keys.
const documentaryAI=new HermesAgentEngine({
  transport:nativeAgentTransport({socketPath:operatorSocket,key:mediatorKey,authorized:true}),
  scopeResolver:scopeResolverFromBindings(operatorManifest.grants)
});
// Pasar documentaryAI a createV3Server({...opcionesExistentes,documentaryAI}).
// Mantener toda la autenticación/RBAC/stateFile/serialización existentes.
```

### Integración de preguntas completada en este candidato

Se fusiona el commit exacto `5b19929fe16568ee1bb07c0a6089d62c1678e333` en **este** worktree, sin modificar el worktree de preguntas/despliegue. El merge conserva ambos linajes de identidad (`0f80bfc` / cherry-pick `ee5404e`) sin volver a aplicar la corrección: los conflictos de `app.js` y `server.js` se resolvieron tomando las versiones de preguntas, pues la rama bridge no había cambiado esos archivos. La implementación de identidad no se duplica. Documentación del flujo incorporado: `docs/onboarding-v3/question-workflow.md` y `question-workflow-qa.md`.

`available('question')` comprueba readiness nativo. El handshake declara `summary/enrich/question`, `onboarding.documentary.bounded.v2`, `onboarding.questions.bounded.v1`, la herramienta única y la política `questionHistory: none`, `maxOriginalRefs: 8`. Proveedor real, aislamiento, commit y toolset deben coincidir; fixtures nunca activan el arranque de producción.

- Se reutilizan `validQuestionContext`, `validateQuestionOutput`, `questionHash` y `applyDocumentary` del flujo fusionado. El adapter proyecta solo las referencias originales seleccionadas (máximo ocho); descripciones, comentarios, criterios y texto/nombres de adjuntos no seleccionados quedan excluidos. La selección vacía conserva el default explícitamente registrado de hasta ocho referencias.
- La respuesta guardada e instrucciones humanas acotadas son contexto no confiable, nunca evidencia independiente. El resultado incluye `questionId`, `questionHash`, `derivatives.question.currentAnswer` y hashes; cambios de fuente/pregunta/respuesta invalidan su aplicación.
- La alternativa se persiste como `alternative-not-applied`. Comparar/incorporar para editar no guarda ni aprueba. Roles, responder confirmado, reviewer independiente y aprobación exacta siguen bajo control humano del servidor existente.
- `contextKey` separa propósito, pregunta, selección, hash de pregunta y baseline de respuesta. Para **todas** las preguntas, el mediador impone historial vacío aun si su almacén contuviera un historial anterior; no carga ni guarda pares de chat de preguntas. El adapter exige `historyMessages: 0`. El diario idempotente es independiente de la clave de sesión: cambiar selección con el mismo executionId produce conflicto, no otra inferencia.
- El callback emite `context-prepared → waiting-model → validating` en esos límites reales. Reserva/persistencia/completado siguen siendo del servidor; no se inventan porcentajes o eventos del modelo.
- La UI muestra el nombre del motor seleccionado y, tras ejecutar, tool-call IDs y fuentes/proyecto/ref/hash de las herramientas observadas, sin reasoning. El modo de prueba se rotula «modelo sintético de prueba, sin proveedor».
- `test-support/native-question-fixture.js` conecta el backend y navegador a un mediador Unix y `AIAgent` **reales** con inferencia determinista explícita. No falsifica atestaciones: usa el marcador de inyección `transport.synthetic` existente en pruebas, registra `synthetic-test-transport` y mantiene el transporte de producción/selector de arranque rechazando ese modo. No existe flag HTTP/env de producto para activar fixtures.

El bootstrap de `server.js` conserva el motor controlado actual salvo autorización nativa explícita, bindings privados no vacíos y readiness real de **los tres** propósitos. La selección ocurre al arrancar; nunca hay replay/fallback a otro proveedor después de una ejecución nativa admitida. Ver [publicación segura y bloqueos operativos](native-agent-publication.md).

## Preparación mínima segura (receta, no ejecutada en producción)

Requisitos comprobados en este host: `bwrap`; runtime Hermes Git con el commit fijado; venv Hermes y su Python uv. Supervisor y broker usan stdlib. No se instala nada ni se cambia configuración de Hermes.

1. Revisar esta rama y los límites anteriores. Elegir directorio/socket **nuevo**, privado y distinto del broker vivo. No necesita puerto TCP ni gateway. El supervisor obtiene lock exclusivo de estado: no reemplaza sockets vivos ni archivos/symlinks; solo elimina un socket huérfano cuando la conexión es rechazada y conserva el lock.
2. Proveer manifiesto y clave propios mode `0600`, directorio mode `0700`, fuera de Git y del directorio estático. Mantener la credencial de proveedor solo en el supervisor de confianza; no montar el HOME Hermes en el contenedor/app V3.
3. Ejecutar primero `python3 scripts/v3-hermes-agent-probe.py --audit` y comprobar todos los booleanos y `agentLoopDenialsVerified`.
4. Para revisión local **solo con manifiesto sintético**, el comando de servicio es:

```sh
python3 scripts/v3-hermes-agent-broker.py \
  --directory <nuevo-directorio-privado> \
  --manifest <manifiesto-sintetico-0600.json> \
  --key-file <clave-mediador-0600>
```

Sin `--real` la inferencia es fixture explícito y `HermesAgentEngine.available()` no lo considera proveedor real. Solo tras autorización del operador, `--real` permite inferencia fija de proveedor: no cambia modelos/perfiles/gateway. No se lanzó ese servicio real en esta entrega. El probe real independiente estuvo limitado al fixture incluido en el script.

5. El bootstrap nativo opt-in ya está incorporado. Autorizarlo solo después de revisar corpus, bindings y readiness real, como detalla la receta de publicación. Sin readiness conserva el LLM actual; tras admitir una ejecución nunca la reintenta mediante otro motor.
6. Aprobar después el usuario de servicio, aislamiento de filesystem de la app, retención, corpus y credenciales. No se crea systemd, reverse proxy, exposición pública, OAuth, despliegue ni infraestructura desde esta rama.

## Sesiones, jobs y límites

El mediador tiene SQLite privado. La clave de sesión depende de actor, org, proyecto, expediente, fuente, propósito, selección/baseline y conjunto exacto de fragmentos/refs/hashes. No usa `state.db` de Hermes ni sesiones/memorias default. Para resumen/enriquecimiento conserva como máximo cuatro pares usuario/respuesta final y 48 KB; para preguntas fuerza historial vacío y sesiones separadas de las documentales. No guarda razonamiento, mensajes internos o transcript nativo. TTL de sesión 24 h, limpieza al admitir otra ejecución; máximo 200 sesiones. El diario tiene máximo 2000 jobs y falla cerrado al llenarse: requiere mantenimiento deliberado del operador, no reciclado silencioso de IDs.

Reserva `running` antes de inferencia; replay idéntico devuelve el resultado; payload distinto con mismo ID da conflicto. Reinicio transforma reservas inciertas en `interrupted-no-retry`. Fallos no se reintentan automáticamente. No se afirma exactly-once frente a fallo de hardware o transacciones entre app y mediador.

Máximo dos solicitudes de proveedor por turno (selección de herramienta + respuesta), 1400 tokens de salida por solicitud, cuatro tool calls, tres iteraciones nativas, 24 KB de prompt y 24 KB de contexto recuperado. Deadline del supervisor 40 s una vez iniciado el worker, CPU del worker 25 s; app 45 s, transporte 48 s. El modelo no tiene reintento de proveedor ilimitado: el supervisor limita peticiones y mata el worker. Un disconnect de la app no revierte una inferencia admitida; consultar el mismo ID evita duplicarla. El sandbox temporal y logs internos se eliminan al terminar; errores públicos son códigos reducidos.

## Matriz de pruebas y verificación

La evidencia del incremento unido se recoge en `native-agent-integration-qa.md` y sus logs externos. El incremento anterior registró 33 pruebas V3 y 3 Python, incluyendo una falla paralela transitoria del test documental preexistente que pasó aislado/serial. Esos totales históricos no se presentan como resultados del merge actual. Para esta entrega se ejecutan pruebas completas **en serie** y nuevamente desde un archivo Git limpio del candidato; no se alteran tests para ocultar fallos.

| Capa | Ejecutado | Qué demuestra / límite |
|---|---|---|
| Native real provider | Un turno sintético, dos requests | `AIAgent` llamó `authorized_context`; respuesta posterior cita Alpha y cobertura limitada. No prueba contratos documentales reales de cliente. |
| OS/dispatch | `test-support/test_v3_agent_boundary.py` | HOME/workspaces/credentials ocultos, red desactivada, mounts read-only, capabilities cero; denegación tanto en registro como antes de herramientas inline. |
| Persistencia | Mismo test Python | Replay durable/reinicio, conflicto, reserva incierta sin retry, scope actor/org/proyecto/case/sourceHash, historial sin reasoning. |
| Unix real + modelo fixture | `test/v3-agent-bridge.test.js` | Servicio Python real y native loop real por socket privado; herramienta realmente ejecutada; salud fixture no se anuncia como real; auth y scope negados. No llamadas pagadas. |
| Adapter documental | Mismo test Node, envelope inyectado y etiquetado como fixture de protocolo | Bindings, schema, fuentes, aplicación como propuesta pendiente, rechazo de respuestas/citas/evidencia incorrectas. No equivale a un E2E documental con proveedor real. |
| Compatibilidad progreso y preguntas | `v3-agent-question*.test.js`, `v3-agent-startup.test.js`, `v3-agent-readiness.test.js` | Tres propósitos, proyección/baseline/hash, alternativa no aplicada, milestones HTTP, herramienta nativa y navegador desktop/mobile. |
| Regresión V3 y legacy | Suites Node/Python completas en serie | Rama de preguntas fusionada más bridge; preservación de identidad, progreso y contratos summary/enrich. Sin inferencia operativa ni nuevas llamadas pagadas. |

Reproducir sin inferencia pagada:

```sh
node --test test/v3-agent-bridge.test.js
python3 test-support/test_v3_agent_boundary.py
npm run check:v3
npm run test:v3
python3 scripts/v3-hermes-agent-probe.py --audit
python3 scripts/v3-hermes-agent-probe.py
```

`python3 scripts/v3-hermes-agent-probe.py --real` **sí** hace llamadas de proveedor y se ejecutó una sola vez; no repetir por rutina. Evidencia del probe no es evidencia de despliegue. Los logs de verificación y el escaneo previo al push se conservan fuera de Git y se informan en la entrega. Escaneo de patrones conocidos no es una garantía DLP: se revisaron además los artefactos nuevos (código, fixtures y resultado sintético) y nombres de archivos históricos para evitar publicar datos operativos.
