# V2 · enriquecimiento Hermes/IA sobre snapshot Azure

## Resultado y límite de este incremento

Implementado el flujo completo de **contrato/adapter fail-closed**, persistencia versionada, endpoint protegido, UI y pruebas con broker sintético. **No se ejecutó inferencia real**, no se arrancó un broker ni se llamó a un proveedor. No se desplegó, reinició, publicó ni escribió en Azure.

El piloto privado 3134 no se envió a ningún modelo y no se incorporó a Git. Las pruebas utilizan exclusivamente datos sintéticos. Un resultado `real` en esas pruebas comprueba la rama del contrato de éxito, **no acredita una ejecución real de Hermes**.

### Descubrimiento oficial e instalado

Consultados `https://hermes-agent.nousresearch.com/docs/llms.txt` y la documentación instalada `website/docs/user-guide/features/subscription-proxy.md`. Código instalado inspeccionado en `/usr/local/lib/hermes-agent`, revisión `3b421578588243f920886e6fe79a6faa87ea026e`:

- `hermes_cli/proxy/server.py`: proxy oficial de inferencia, sin loop agente. No autentica al cliente con una credencial propia; acepta cualquier bearer. Reenvía el cuerpo, no impone este snapshot/schema/política y puede reintentar un 401/429. **No satisface por sí solo el broker especializado autenticado requerido.**
- `gateway/platforms/api_server.py`: API del agente y sus herramientas/sesión, no frontera de inferencia sin herramientas.
- `cli.py:1519–1524,1563–1564`: toolsets vacíos no constituyen exclusión explícita y pueden resolver defaults. No se invocó `hermes chat --toolsets ''`; safe-mode tampoco se utilizó como aislamiento.
- No se descubrió un broker especializado autorizado/configurado para este dashboard. No se inspeccionaron ni copiaron pools OAuth; no se modificaron perfiles, gateways ni credenciales de personas.

**BLOQUEO REAL:** falta un servicio Hermes local especializado autenticado, con integración de proveedor autorizada, modelo/coste/scope aprobados, ejecución demostrablemente sin herramientas y controles del contrato siguiente. El proxy genérico instalado y el API de agente no son sustitutos seguros. Tener un proveedor en esta conversación no autoriza transportar su OAuth a la aplicación ni presentar una llamada LLM directa como ejecución de Hermes.

## Código y rutas

- `src/onboarding-v2/hermes-enrichment.js`: proyección de datos, política acotada, validación de salida, timeout y aplicación mediante `model.change` fase 1.
- `src/onboarding-v2/hermes-broker.js`: cliente HTTP sobre **socket Unix**, no escucha puertos; HMAC-SHA256 independiente del proveedor, request/response enlazados.
- `src/onboarding-v2/server.js`: `POST /api/hermes/enrich`, journal durable de ejecuciones y generación asíncrona fuera de la cola de edición; commit serializado con revisión revalidada.
- `public/onboarding-v2/app.js`: botón separado «Enriquecer con Hermes», confirmación explícita, estados `not-configured`, `not-run`, `in-progress`, `failed`, `real`; comparación con original/antes-después y edición humana existente. Publicar Azure sigue deshabilitado.

El prefijo público, directorio reducido de nombres/frentes, roles y configuración SSO existentes permanecen intactos. En producción se mantiene `authMode=sso`; `local-review` solo sirve para desarrollo sintético, no prueba un login corporativo.

### Endpoint de aplicación

Cuerpo permitido: `{"revision":1,"executionId":"UUID-generado-por-el-cliente"}`. No acepta snapshots, prompt, tools, URL de proveedor, modelo, aprobaciones ni contenido de resultado proporcionados por el cliente.

Requiere la sesión y RBAC V2 existentes (`editor` o `coordinator`), Origin exacto y revisión actual. `202` inicia/consulta la misma ejecución en curso; `200` devuelve una ejecución terminal ya existente; reutilizar ID con otro actor/revisión da `409`. GET de `/api/state` es privado y contiene el estado de la ejecución.

Una reserva se persiste **antes** de contactar al broker. No se reintenta automáticamente. Tras reinicio, un journal `in-progress` sin trabajo en memoria se presenta como `failed / interrupted-no-retry`; repetir ese ID no hace otra llamada. Una nueva ejecución requiere un nuevo ID explícito. Una sola generación activa por proceso, sin cola adicional de inferencia (`429 busy`). Journal limitado a 100 entradas, sin expulsar IDs ni reusar silenciosamente sus efectos. Se necesita archivado administrativo explícito antes de ampliar ese límite; no está implementado.

La generación no bloquea que otro cliente guarde una edición humana. Si cambia la revisión o fuente antes del commit, falla sin aplicar la propuesta. Fallos solo actualizan el journal; **no cambian fases, revisión del borrador, historial de versiones ni aprobaciones**. Un fallo de disco deja una reserva ambigua que no se reejecuta automáticamente. Se soporta un único proceso escritor de la aplicación; no se afirma exclusión distribuida entre réplicas.

### Fuente y propuesta

El snapshot completo y hash original permanecen en almacenamiento privado V2 y solo se entregan por API autenticada. El broker recibe una proyección de campos documentales: ID/revisión, título/descripción/criterios, comentarios y texto de adjuntos ya extraídos; sin identidades estructuradas, campos arbitrarios, relaciones de navegación, tokens ni archivos de configuración. No descarga URLs ni abre adjuntos. Texto Azure, incluido un intento de prompt injection, se transporta como datos, no como instrucciones ejecutables.

Rechaza entradas excesivas sin truncado silencioso. Política fija: hasta 48.000 bytes de payload y 48.000 tokens de entrada como techo del contrato, 2.000 tokens de salida, 32.000 bytes de JSON de salida y 45 segundos de espera global de la inferencia, con abort de transporte. El broker debe contar tokens del prompt completo con el tokenizer del modelo y aplicar también esos límites aguas arriba: la app no dispone del tokenizer y no convierte bytes a una cuenta exacta de tokens. El parser del transporte corta respuestas de más de 40.000 bytes, incluyendo envelope. Los patrones obvios de credenciales se rechazan en entrada/salida; esto **no es una garantía universal de DLP**.

Salida estricta: solamente `context`, `constraints` (texto acotado) y `questions` (máximo 12 preguntas). No puede establecer owners, título, fuentes originales, ambiente, estado QA, respuestas a bloqueos o decisiones de aprobación. Se conserva la información humana anterior y se añaden preguntas obligatorias de entorno/build y reproducción sin responder. Todo contexto IA se rotula como **propuesta no verificada**; la validación de JSON no demuestra exactitud semántica, causas ni resultados QA. Es obligatoria la revisión humana.

Éxito crea versión con actor, modelo, fecha, executionId, sourceHash, inputHash, outputHash, estado `real` y output original. `sourceHash` enlaza el snapshot completo; `inputHash` es SHA-256 de `JSON.stringify(request)` sin el propio campo inputHash; `outputHash` enlaza el JSON de salida validado. `model.change` conserva versión previa e invalida aprobaciones dependientes; no crea decisiones nuevas. La IA de consistencia de fase 4 y QA software siguen **no ejecutadas**, independientes de este enriquecimiento de fase 1.

## Configuración — preparada, NO aplicada

Sin las cuatro condiciones se mantiene desconfigurado, sin fallback a CLI, API agente, proxy genérico ni proveedor externo:

| Variable | Significado |
|---|---|
| `V2_HERMES_AUTHORIZED=true` | Atestación operativa explícita de aprobación de scope/proveedor/modelo/coste y auditoría del broker; no sustituye una autorización humana real. |
| `V2_HERMES_MODEL` | Modelo fijo autorizado, no elegible desde frontend. |
| `V2_HERMES_BROKER_SOCKET` | Ruta absoluta del socket privado de un broker especializado ya auditado. |
| `V2_HERMES_BROKER_KEY` | Secreto dedicado de al menos 32 caracteres para MAC, **no** token OAuth/API del proveedor. Solo runtime privado. |

No existe un servicio listo para activar solo cambiando estas variables. `configured=true` indica que se suministró el adapter; no es un health check de disponibilidad ni prueba de autorización. No se añadieron overlays de despliegue ni se provisionaron claves. Antes de cualquier activación hay que resolver permisos del socket entre contenedores/UID y montar exclusivamente el socket, nunca el home ni auth pools de Hermes.

### Contrato pendiente del broker

`POST /v1/onboarding/enrich` sobre socket Unix. Request: `{payload, mac}`, MAC hexadecimal de 64 caracteres, calculado sobre los bytes UTF-8 de `JSON.stringify(payload)`. La serialización y orden de claves deben conservarse; no es un estándar de JSON canónico interoperable. El broker debe verificar MAC con comparación constante, autorizar el único esquema y modelo, rechazar campos/políticas adicionales y conservar idempotencia propia.

La respuesta también es `{payload, mac}` firmada con la clave dedicada. Payload requerido:

```json
{
  "schema": "onboarding.hermes.result.v1",
  "runtime": "hermes-bounded-inference-v1",
  "executionId": "mismo-id",
  "inputHash": "mismo-hash-entrada",
  "sourceHash": "mismo-hash-fuente",
  "model": "mismo-modelo-autorizado",
  "toolsExecuted": 0,
  "output": {"context":"propuesta","constraints":"pendientes","questions":[]}
}
```

El marcador runtime y toolsExecuted son **atestaciones de un broker confiable, no una prueba criptográfica de aislamiento**. Antes de activarlo, su implementación debe demostrar que no instancia el loop agente, dispatcher de tools, skills, memorias, shell, fetch de URLs o carga de contexto desde fuentes. Debe usar solamente la integración Hermes/proveedor existente expresamente autorizada y soportada, sin copiar credenciales a la app, sin reenviar fallos upstream y sin loguear cuerpos. Debe imponer límites de tokens, timeout aguas arriba, una sola llamada sin retries y deduplicación incluso en restart. Nada de esto se da por implementado por disponer del adapter.

## QA y evidencia

Se observaron fallos RED reales por módulo/endpoint/export ausente, detección de credenciales ausente, política maxInputTokens ausente y error de almacenamiento sin sanitizar, antes de su implementación. El browser requirió esperar el bootstrap antes de enviar login; el fallo inicial de navegación se corrigió en la prueba, no fabricando respuestas del backend.

Comandos de aceptación: `npm run check`, `npm run check:v2`, `npm test`, `npm run test:hermes` y `python3 -m unittest discover -s test -p '*_test.py'`. Resultados finales y rutas privadas de evidencia en `hermes-enrichment-qa.md`.

Pruebas cubren auth anónima/expirada/no asignada/lector, Origin, revision stale, éxito versionado, aprobación anterior invalidada, fallo sin cambio de borrador, edición humana concurrente, idempotencia durable/restart, concurrencia/timeout, snapshot corrupto/injection, límites y datos sensibles, validación/tampering de output y MAC/binding/tamaño reales sobre socket Unix.

El browser Chromium usa el **backend real** sobre socket Unix; CDP solamente puentea transporte de red y devuelve los bytes producidos por `http.Server`. No hay respuestas HTTP prefabricadas, pero el transporte de inferencia es sintético y se identifica así. Verifica generación/estados, edición humana, comparación antes/después/fuente, fallo atómico y layout móvil. No valida credenciales reales de SSO ni inferencia de un proveedor.

Pendiente: implementar/auditar/autorizar broker; ejecutar inferencia acotada del piloto privado 3134 fuera de producción; revisión humana de su contenido; login corporativo real; publicación de artefacto por el responsable de despliegue. La escritura/publicación Azure es otro bloque y permanece deshabilitada.
