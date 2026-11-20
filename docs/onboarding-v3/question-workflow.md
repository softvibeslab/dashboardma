# V3 · preguntas asistidas, versiones y progreso durable

## Alcance y límites

Rama `feature/onboarding-v3-question-workflow`, base `a30f1692c32ee24e7749064ee1fef3e31dc05818`. La corrección independiente de identidad `0f80bfcb5c2d4bf77132d572fcbef7c53909e779` se integra mediante cherry-pick; se preservan nombre/correo de sesión y RBAC por identidad verificada, no por correo.

**Candidato de código, no publicación de UI.** No se despliega V3, V2, main, broker ni worker. Ningún expediente real se modifica, ningún CP se cierra y Azure permanece de solo lectura con su política existente. Las pruebas utilizan únicamente fuentes, usuarios y proveedores sintéticos. No hay llamadas pagadas ni inferencia sobre datos de clientes.

El motor de esta rama sigue siendo **LLM documental controlado sin herramientas**, no un agente Hermes. El puente de agente real se desarrolla independientemente en `feature/onboarding-v3-hermes-agent-bridge` y no está integrado ni validado por esta entrega. La etiqueta de respuesta asistida procede de `questionAI.engine`; no se inventan eventos de herramientas ni razonamiento interno.

## Contrato operativo

1. Importar explícitamente Azure o editar el borrador, inspeccionar fuente original y guardar una semilla humana independiente. Importar nunca lanza inferencia.
2. Reservar ejecución antes de inferir. El diario mantiene ID, actor, revisión, fuente, propósito, derivados y marcas temporales. Cada ID es terminal: una repetición idéntica lee el resultado, otra carga con el mismo ID produce conflicto; no hay reintento automático.
3. Mostrar hechos de ejecución: `received → context-prepared → waiting-model → validating → persisting → completed`; ante error, `failed`. Al arrancar, las reservas incompletas pasan a `interrupted` con `interrupted-no-retry` antes de atender solicitudes. Se conservan duración y última actualización. No porcentajes ficticios ni chain-of-thought. Los hitos proceden del servicio, nunca del texto del modelo; el servicio legacy solo emite los hitos que realmente conoce.
4. La propuesta de enriquecimiento conserva diferencias/historial. Las preguntas legacy siguen visibles y editables, pero una respuesta preexistente **no equivale a aprobación individual**.
5. Clasificar preguntas como técnicas, producto o comerciales; área/frente y rol sugerido son metadatos documentales. Se mantienen pendientes hasta decisión humana. Solo coordinador confirma responder/reviewer entre identidades RBAC existentes. Se exige editor para responder y reviewer independiente para revisar. No se infiere especialidad, no se conceden roles y no se usa el directorio público como autorización.
6. Sugerir/profundizar por pregunta es un propósito fijo: fuente original acotada (máximo ocho referencias), pregunta, respuesta guardada e instrucciones humanas de hasta 2000 caracteres. Solo texto de adjuntos realmente extraídos aporta evidencia. Referencias no seleccionadas no envían contenido; si no se eligen IDs se toman hasta ocho originales y queda la selección registrada. Entrada máxima 48 KB; salida 2000 tokens/28 KB de contrato; plazo 45 segundos; sin herramientas, URLs arbitrarias ni prompts de sistema del cliente.
7. La alternativa registra fuentes, supuestos, limitaciones, suficiencia de evidencia y transporte. No sobrescribe el texto humano. Comparar/incorporar para editar/descartar son acciones distintas; incorporar no guarda ni aprueba. El borrador y las aprobaciones no cambian si falla, queda obsoleta o se interrumpe la inferencia.
8. Guardar borrador y guardar listo para revisión crean versiones. Aprobar/devolver requieren exactamente ID de pregunta, hash de pregunta/fuentes, versión y hash de respuesta; el servidor registra actor/rol/hora. Devolver requiere motivo. Cambios materiales o de asignación invalidan la vigencia, sin borrar decisiones antiguas. Editar/revertir mediante el formulario legacy crea nuevas versiones, no resucita una aprobación anterior.
9. SPEC y paquete conservan `source → questions → answer versions → individual decisions → context review → spec`. Preguntas bloqueantes no aprobadas impiden revisar contexto, preparar SPEC, decisiones posteriores y exportar. Una aprobación individual no sustituye la revisión documental global, staffing, QA ni cierre CP.
10. Filtros de categoría/área/persona/estado/bloqueantes/mías, disclosures nativos y expandir/contraer todas no modifican estado. Polling conserva respuestas humanas sin guardar, filtros, apertura de tarjetas y paneles de asistencia; las instrucciones humanas de profundización permanecen locales. Conflictos de revisión requieren revisión humana, no reemplazo silencioso.

## API y persistencia

- `GET /api/state`: `questions`, `questionAI`, `hermes.execution.progress`, `elapsedMs`, fuentes y diario privado autenticado.
- `POST /api/questions/action`: `assign`, `answer`, `approve`, `return`, `discard`, con revisión exacta.
- `POST /api/questions/generate`: ID de pregunta, revisión, executionId, instrucciones y sourceRefs; se usa para sugerencia inicial y profundización.
- Se reutiliza `/api/hermes/enrich`, `/api/ai/summary`, semilla/resumen V3 y la cola de escritura existente.
- Nuevo esquema de broker `onboarding.questions.bounded.v1`, propósito `question`, separado y compatible con `onboarding.documentary.bounded.v2` (`summary/enrich`) y v1 legacy. Readiness firmado debe anunciar el nuevo esquema antes de habilitar preguntas. El broker/worker vivo no se cambia.
- Un solo escritor por archivo de estado. Escritura temporal privada + rename y cola local; no se afirma transacción distribuida ni garantía frente a pérdida eléctrica. No ejecutar dos servidores sobre el mismo archivo.
- Las reservas y alternativas no son versiones de respuesta humana. Una alternativa no avanza la revisión documental ni modifica approvals.

## Matriz de aceptación → pruebas

| Criterio | Oráculo ejecutable | Estado |
|---|---|---|
| Hitos reales, elapsed/last update, reserva antes de inferencia | `v3-question-http.test.js` verifica archivo y secuencia de eventos | Implementado |
| Idempotencia, conflicto de carga, estado terminal | `v3-question-http.test.js`, `v3-documentary-http.test.js`, broker regression | Implementado |
| Reinicio sin replay, interrupción persistida | `v3-documentary-http.test.js` cierra/recrea servidor y relee disco | Implementado |
| Clasificación humana y persona confirmada vs pendiente | `v3-question-workflow.test.js`, Chromium | Implementado |
| Identidad, revisor independiente, no coordinador como aprobador | unitarios y HTTP de preguntas, identidad, SSO | Implementado |
| Fuentes bounded, instrucción fija, salida estricta y sin roles del modelo | `v3-question-broker.test.js`, `v3-question-safety.test.js`, Python worker | Implementado |
| Alternativa vs texto humano, comparar/incorporar/descartar | `v3-question-browser.test.js` y safety | Implementado |
| Deepen con respuesta actual y resultado separado | Chromium comprueba payload y texto humano persistente | Implementado |
| Version/hash exactos, devolución con motivo, historial | unitarios/HTTP/Chromium de preguntas | Implementado |
| Cambios de fuente, stale y fallos preservan borrador | safety, workflow y HTTP documental | Implementado |
| Save legacy/edit/revert no resucita aprobaciones | workflow y `/api/action` de V3 | Implementado |
| Preguntas→contexto→SPEC con provenance y gates | `v3-continuity-http.test.js`, `v3-continuity-browser.test.js` | Implementado |
| Desktop/mobile, collapse, filtros, reload/historial | Chromium real con backend, no interceptación HTTP | Implementado |
| Polling conserva texto sin guardar/expansión | Chromium pausa proveedor sintético y comprueba ambos | Implementado |
| Directorio público name/fronts sin email | regresión classifications/public directory + identity browser | Sin ampliación |
| Azure reads/allowlist, sin writes | regresión existente; conectores sin cambios de alcance | Sin ampliación |
| Nombre/correo sin conceder permisos | cherry-pick identidad + pruebas identity/SSO/browser | Integrado |
| Agente Hermes real y herramientas autorizadas | Puente independiente, no ejecutado aquí | Pendiente independiente |
| Broker actualizado real/SSO humano/cliente/CP/producción | No autorizado en esta entrega | No ejecutado |

## Reproducir QA aislada

Desde el worktree:

```sh
npm run check
npm run check:v3
node --test --test-concurrency=1
python3 -m unittest discover -s test -p '*_test.py'
node --test test/v3-question-browser.test.js test/v3-identity-browser.test.js
```

Chromium debe estar instalado. Los tests crean directorios privados bajo `$TMPDIR`, servidor real en loopback o socket Unix, usuarios `local-review` sintéticos y proveedor sintético explícito. Cierran servidor/navegador y no leen runtime vivo. Capturas y logs están fuera de Git; se informa la ruta en la salida. Para evitar carreras de carga en Chromium, ejecutar la regresión serial.

Para un arranque manual aislado, usar un archivo **sintético privado** de usuarios con IDs/roles/token de revisión local (no credenciales corporativas), un nuevo `V3_DATA_FILE`, puerto libre verificado, `V3_LISTEN_HOST=127.0.0.1`, `V3_AUTH_MODE=local-review`, `V3_REVIEW_USERS_FILE=<archivo sintético privado>` y `V3_IDENTITY_ROLES_FILE=`. Ejecutar `npm run start:v3`. Nunca apuntar al volumen/runtime productivo. Sin broker configurado las acciones de inferencia permanecen visibles pero deshabilitadas; la vía funcional con transporte sintético es la prueba HTTP/Chromium anterior, no una respuesta demo codificada en producto.

No reutilizar cookies SSO reales ni asignar reviewer/QA a usuarios operativos para hacer pasar QA. `V3_HERMES_AUTHORIZED`, socket, clave y modelo solo habilitan el broker existente según su contrato; no son permiso para enviar expedientes reales ni para desplegar. La actualización futura de broker+worker debe ser explícita y coordinada, nunca realizada por esta rama.

## Publicación del código y seguridad

Antes del push, escanear **todos los objetos nuevos y commits ancestrales no alcanzables desde refs remotas**, no solo el diff de trabajo. Incluir comprobación de nombres de archivos confidenciales, patrones de credenciales, comparación con valores secretos del runtime sin imprimirlos, metadatos de commits y revisión de imágenes ancestrales. `.gitignore` y los Dockerfile-specific allowlists excluyen datos, runtime, backups, .env y research. La dependencia compartida de contrato de preguntas vive en `src/onboarding-v2/` para no romper el build V2 que no copia V3.

Push sin force de esta rama únicamente; después comparar SHA completo de HEAD con `git ls-remote origin refs/heads/feature/onboarding-v3-question-workflow`. No afirmar publicación de UI por haber subido código.
