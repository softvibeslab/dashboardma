# QA · V3 question workflow (sin despliegue)

## Candidatos y resultado

- Base: `a30f1692c32ee24e7749064ee1fef3e31dc05818`.
- Identidad integrada: cherry-pick de `0f80bfcb5c2d4bf77132d572fcbef7c53909e779` → `ee5404ece17f72a0bbd14ca664ad4e632eeef9b7`; conflictos de app/server resueltos conservando workflow y nombre/correo autenticados.
- Candidato backend/UI inicial: `f176ee3eaaeb6bd9447d18e0c3e8559207619bcc`. Regresión completa desde archivo Git inmutable: **254 Node, 254 pass, 0 fail**; Python **30 pass**; `check`, `check:v2`, `check:v3` correctos.
- Candidato final de código: `89473c9ae4a10149e16ac1fc80474cf01bb65db2`. Incorpora retención adicional de semilla y controles locales durante polling. Chromium de preguntas y documental **2/2 pass** tras reproducir primero la pérdida de semilla como test rojo.
- Regresión completa final desde archivo Git inmutable de `89473c9…`: **254 Node, 254 pass, 0 fail**; Python **30 pass**; `npm run check`, `check:v2` y `check:v3` correctos. Comando Node: `npm test -- --test-concurrency=1`.
- Evidencia privada durable: `/root/.local/share/dashboardma-question-workflow-qa/89473c9/` (logs, capturas sintéticas, resultados reducidos de escaneo).

Los commits posteriores que solo añadan este informe no modifican el código ejercitado. No se han usado proveedor pagado, expediente real, cookies reales ni credenciales de usuarios en Chromium.

## Qué se ejercitó

1. Servidor HTTP real + transporte sintético bloqueado: reserva en disco, hitos reales, duplicados y conflictos, resultado separado, permisos de asignación/respuesta/revisión.
2. Broker firmado real con runtime sintético: contrato fijo de pregunta, contexto elegido (hasta ocho fuentes originales), respuesta actual, política sin herramientas y rechazo de campos extra/referencias falsas. El worker Python construye JSON schema estricto de pregunta; legacy summary/enrich conserva contrato.
3. Unitarios: versión/hash exactos, actor y rol, reviewer independiente, motivo de devolución, historial retenido, invalidación de fuentes, stale y fallo atómico; edición y reversión legacy crean nuevas versiones sin resucitar aprobación.
4. Reinicio real de servidor HTTP: cierre y nueva instancia, reservas pendientes persistidas como interrumpidas y sin reintento. Se conserva el borrador y el diario previo.
5. Chromium real/backend: clasificar/asignar → sugerir → progreso → edición humana sin guardar + semilla sin guardar + collapse durante polling → conservar ambos textos → incorporar/edit → guardar para revisión → profundizar con respuesta actual sin sobrescribir → descartar alternativa → devolución con motivo → nueva versión → aprobación exacta → reload/historial → filtros y expand/collapse en desktop/mobile. Se comprobaron ausencia de excepciones JS y fuente original intacta.
6. Chromium continuidad: aprobación individual → revisión contextual independiente → SPEC explícita con procedencia de respuestas/aprobaciones, conservación de SPEC manual e historial; no cierre CP ni QA/software inventados.
7. Chromium identidad: nombre/correo de sesión firmada sintética a través de entrada/siete fases/catálogo, sin concesión por email ni ampliación del directorio público.

La regresión existente de Azure, RBAC, fuentes, staffing, directorio público, versiones, broker, Node y Python se ejecutó sin consultas operativas nuevas.

## Imágenes y builds aislados

- Docker V3 construido desde el archivo limpio del candidato `89473c9…`; contexto allowlist **327.33 kB**.
- Smoke V3: imagen no-root, read-only y `--network none`; config 200, estado anónimo 401, `questions.js` e `identity.js` 200. Sin puertos publicados, sin rutas de proxy ni volumen de producción.
- Docker V2 construido por separado; contexto allowlist **82.29 kB**. Importar el broker/contrato compartido en imagen V2 pasa sin depender de archivos V3.
- Captura móvil final inspeccionada: filtros en disclosure nativo, controles dentro del viewport, categoría/área/estado visibles, sin datos reales. La regresión de descubrimiento mobile del flujo V1 conserva la respuesta en el viewport.

## Incidencias resueltas y límites

- Se corrigió overflow móvil causado por hashes/metadatos y el espacio ocupado por los filtros; filtros ahora accesibles en disclosure.
- Se reprodujo y corrigió pérdida de semilla sin guardar durante polling, además de preservar respuesta, disclosures y selección de inclusión de resumen.
- Una corrida de desarrollo contra fuentes que se estaban moviendo resolvió imports transitorios incorrectos; **no se usa como resultado de aceptación**. Las corridas válidas utilizan archivos Git inmutables. Los logs fallidos de desarrollo se conservan por separado.
- Esta rama no contiene el nuevo puente de agente Hermes real. El motor probado sigue siendo documental LLM; el runtime sintético está etiquetado como sintético, no como prueba de IA real.
- Clasificación/rol sugerido y asignación humana siguen pendientes cuando no están confirmados; no se inventan personas ni especialidades. Sin reviewer existente, la UI y backend muestran/bloquean aprobación explícitamente.
- No se prueba aquí login corporativo humano, inferencia operativa, Azure writes, QA de software ni publicación de la UI. No se despliega broker/worker/V3/V2/main.

## Logs y publicación del código

Logs y capturas sintéticos permanecen fuera del repositorio; el informe final identifica el directorio privado durable. El escaneo de objetos cubre commits, árboles y blobs nuevos/ancestrales respecto a referencias remotas, incluidos veinte PNG ancestrales revisados como fixtures. Se comparan patrones de credenciales y valores secretos leídos privadamente sin imprimirlos. Solo se registra el número de valores comparados y hallazgos, nunca sus contenidos.

El push se autoriza exclusivamente para `feature/onboarding-v3-question-workflow`, sin force ni tags. Se exige releer la referencia remota y comparar el SHA completo antes de reportar publicación del código. Ese push no publica la UI.
