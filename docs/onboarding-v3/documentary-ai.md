# V3 · Resumen IA y semilla de enriquecimiento

Tres capas distintas: **original Azure inmutable**, **resumen IA versionado pendiente de revisión**, **semilla humana versionada**. No se ejecuta inferencia al importar ni al cargar/expandir la interfaz.

## Acciones y límites
- Generar resumen con IA: acción explícita, editor/coordinator, confirmación de envío al broker aislado. Necesidad de negocio, alcance, criterios propuestos, ambigüedades y preguntas con referencias permitidas del snapshot. Las citas prueban identidad de fuente, no veracidad ni entailment. Los textos siguen siendo propuestas.
- Adjuntos: nombre/tipo/estado y, solo con texto extraído, aporte IA propuesto/uso/limitaciones. Metadatos, formatos no compatibles o fallidos no se presentan como analizados. PDF/Office/OCR no tienen nuevos extractores. Cero adjuntos significa cero fichas inventadas.
- Una sugerencia de instrucción puede adoptarse en la semilla; reemplazar texto existente requiere confirmación. Guardar semilla registra actor, fecha, versión, hash y sourceHash/revisión Azure, preservando historial. Texto acotado a 4000 caracteres, con rechazo de patrones de credencial. No introducir secretos.
- Revisar resumen registra revisión exacta de contexto, **no aprobación** ni cierre CP. Incluirlo al enriquecer requiere además checkbox explícito; no se usa como fuente independiente. El preview privado permite revisar snapshot proyectado, sourceRefs y derivados exactos (sin credenciales).
- Enriquecer con Hermes conserva el rótulo familiar, con aviso de **LLM controlado, no agente Hermes**. Envía snapshot documental/solo texto extraído + semilla guardada + resumen revisado solo si se seleccionó. Guarda provenance de semilla/resumen/payload y criterios/preguntas/limitaciones de nueva versión; conserva respuestas humanas y original.

## Protocolo y concurrencia
`onboarding.documentary.bounded.v2` admite exclusivamente `summary` y `enrich`, instrucciones de sistema fijas, JSON estricto y sourceRefs calculadas de contenido realmente proyectado. No admite prompts de sistema, herramientas, modelos o URLs arbitrarios. Broker/HMAC/socket/supervisor bwrap existentes; worker Python aislado y sin herramientas. Esquema anterior permanece compatible.

Reserva persistente en V3 antes de inferencia; ledger de broker reservado/sin reintento antes del proveedor. Idempotencia ligada a actor/revisión/purpose/selección del resumen. Comprobación de revisión, sourceHash y derivados al aplicar. Cambios humanos concurrentes invalidan el resultado; fallos/timeouts preservan borrador, semilla y resumen anterior. Reinicio muestra `interrupted-no-retry`, nunca reintenta automáticamente. GET y preview no migran ni reescriben datos.

Límites existentes: entrada 48 KB, salida 2000 tokens/32 KB, 45 s, sin retry. Mensajes de error públicos genéricos; fuente y derivados privados bajo SSO/RBAC. Ningún permiso nuevo ni escritura Azure.

## Verificación
- Pruebas modelo/HTTP/broker/worker y Chromium real-backend sintético: generación explícita, edición/reload/adopción con confirmación, preview, revisión exacta, semilla en salida/provenance, XSS, citas inválidas, purpose/policy alterados, idempotencia, reserva, carrera, fallo, timeout y reinicio.
- `scripts/v3-documentary-deployed-smoke.mjs` es **opt-in**, no se ejecuta en regresión: máximo una llamada real de resumen y una de enriquecimiento sobre biblioteca ficticia y adjuntos sintéticos. Requiere `V3_SYNTHETIC_AUTHORIZED=true`; ante fallo no reintenta ni usa clientes reales.
- La publicación exige respaldo privado/restaurable, git archive/OCI exactos, runtime inmutable del broker/worker, readback de activos y controles 401/403, readiness firmada y datos V3/V2/container IDs V1/V2 preservados. La sesión corporativa humana y los formatos no extraídos siguen siendo límites explícitos.
