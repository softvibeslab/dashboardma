# Plan — Portal de requerimientos y enriquecimiento integrado con QA

**Estado:** MVP VERTICAL SLICE EJECUTADO Y VERIFICADO; fases de seguridad, Hermes real, QA operativo e integraciones externas pendientes.
**Cliente/proyecto:** MobilityApps / flujo de requerimientos, QA y desarrollo.
**Fuente primaria:** `Meeting Transcription (21).txt`, especialmente 01:14:08–01:26:29.
**Dashboard existente revisado:** `/root/workspaces/mobilityapps-dashboard-control-tower`.
**URL documentada del dashboard existente:** `https://iamobilityappsinc.com/dashboard`.

## 1. Objetivo

Crear un portal de intake y enriquecimiento de requerimientos que permita a Wilson —y posteriormente a otros roles autorizados— crear una historia, adjuntar o referenciar toda la información disponible, solicitar el enriquecimiento con Hermes y conducir el resultado por un flujo verificable hasta QA, Diseño y Desarrollo.

El portal no debe sustituir Azure DevOps/Teams como fuente de verdad sin una decisión explícita. En la primera versión debe funcionar como una capa controlada de captura, orquestación, trazabilidad y evidencia, enlazable a un ticket externo.

## 2. Qué solicitó Mauricio: requerimientos extraídos

### 2.1 Funcionales

**REQ-INT-001 — Crear requerimiento/ticket**
- Usuario autorizado puede iniciar un requerimiento nuevo.
- El sistema genera un identificador único, por ejemplo `REQ-0001`.
- Debe registrar título, descripción inicial, solicitante, cliente/proyecto, prioridad y fecha.

**REQ-INT-002 — Adjuntar fuentes heterogéneas**
- Aceptar documentos PDF, texto/Markdown, transcripciones, imágenes y grabaciones/videos, sujeto a límites definidos.
- Permitir pegar una URL de fuente externa, incluyendo una URL de Teams u otro repositorio autorizado.
- Registrar nombre, tipo, tamaño, URL, hash, origen, usuario que cargó el recurso y estado de procesamiento.
- No asumir que toda URL es pública: debe existir una política para URL pública, URL protegida o carga directa.

**REQ-INT-003 — Solicitar enriquecimiento**
- Mostrar una acción equivalente a “Enriquecerme la historia”.
- El sistema debe conservar la versión original y crear una ejecución de enriquecimiento con estado, fecha, modelo/agentes usados y resultado.
- La ejecución debe ser asíncrona y mostrar progreso, errores y reintento seguro.

**REQ-INT-004 — Orquestación multiagente**
- Hermes/orquestador debe distribuir el análisis a agentes especializados, como mínimo:
  - extracción y normalización de fuentes;
  - analista de requerimientos;
  - generador de preguntas;
  - generador de criterios de aceptación, escenarios y datos de prueba;
  - verificador/critic, con revisión separada del resultado.
- La salida debe conservar qué agente generó cada sección y qué evidencia/fuente la respalda.
- La IA propone; no aprueba ni cierra el requerimiento por sí sola.

**REQ-INT-005 — Preguntas y respuestas**
- Presentar las preguntas detectadas dentro del mismo requerimiento.
- Permitir que Wilson u otro rol autorizado responda una a una o en lote.
- Permitir reabrir preguntas cuando una validación encuentre información insuficiente.
- Mantener historial de preguntas, respuestas, autor, fecha y versión del documento afectado.

**REQ-INT-006 — Ciclo de validación**
- Soportar como mínimo `Validación 1`, correcciones/re-preguntas y `Validación 2`.
- Permitir iteraciones adicionales sin sobrescribir versiones anteriores.
- Cada validación debe tener resultado: pendiente, aprobado, aprobado con observaciones, devuelto o bloqueado.
- Solo una persona autorizada puede aprobar una validación.

**REQ-INT-007 — Documento enriquecido**
Generar una versión descargable y consultable que incluya:
- resumen y alcance;
- contexto y supuestos;
- preguntas respondidas y pendientes;
- requerimientos funcionales/no funcionales;
- criterios de aceptación;
- escenarios/casos de prueba;
- datos de prueba;
- riesgos, dependencias y decisiones abiertas;
- fuentes y trazabilidad;
- historial de versiones y estado de verificación.

**REQ-INT-008 — Handoff por etapas**
El flujo solicitado es:

`Nuevo → Anexos → Enriquecimiento → Preguntas → Validación 1 → Validación 2 → Listo para Wilson → QA → Diseño → Desarrollo → Cerrado`

El sistema debe:
- mostrar owner y siguiente responsable;
- registrar entrega y recepción de cada handoff;
- impedir avanzar si faltan los criterios mínimos del gate;
- permitir devolución a preguntas o validación conservando el motivo.

**REQ-INT-009 — Integración con QA**
- El resultado enriquecido debe alimentar el módulo QA existente.
- QA debe recibir criterios, escenarios, datos de prueba, riesgos y anexos relevantes sin copiar manualmente el contenido.
- QA debe poder registrar casos, estado `PASS/PENDING/FAIL/BLOCKED`, evidencia y defectos.
- El requerimiento debe mostrar una vista agregada de cobertura QA y enlaces a la evidencia.

**REQ-INT-010 — Entrega y notificaciones**
- Dejar el documento y la trazabilidad en el mismo requerimiento/ticket.
- Permitir exportar o enlazar el documento para correo, Teams o Azure DevOps cuando exista integración autorizada.
- En MVP, una notificación puede ser interna; el envío externo requiere autorización, configuración y verificación explícitas.

**REQ-INT-011 — Auditoría y trazabilidad**
- Registrar creación, carga, procesamiento, edición, aprobación, devolución, handoff y exportación.
- Relacionar `fuente → extracción → requerimiento → criterio → prueba → evidencia → aprobación`.
- Mostrar siempre versión, actor y timestamp.

### 2.2 No funcionales

**REQ-NF-001 — Acceso y roles**
- Login para Wilson y usuarios autorizados.
- Roles iniciales sugeridos: `Requester`, `Wilson/Analista`, `QA`, `Diseño`, `Desarrollo`, `PO/Admin`, `Viewer`.
- Separar proyectos/clientes y aplicar mínimo privilegio.
- No almacenar contraseñas en el repositorio ni en el JSON de datos.

**REQ-NF-002 — Seguridad de anexos y URLs**
- Validar tipo, tamaño, extensión y contenido.
- Malware scanning y límites de consumo antes de enviar contenido a un modelo.
- No incorporar secretos, tokens o credenciales de las fuentes en prompts ni registros.
- Definir retención, borrado y clasificación de documentos.

**REQ-NF-003 — Confiabilidad**
- Jobs idempotentes, reintentos acotados, estado de error y recuperación.
- El fallo de un agente no debe borrar la versión original ni dejar el ticket en estado falso.
- Mostrar `PENDIENTE`, `BLOQUEADO` o `ERROR` cuando no exista evidencia suficiente.

**REQ-NF-004 — Observabilidad**
- Métricas de intake, tiempo de enriquecimiento, errores por agente/gateway, reintentos, preguntas pendientes y duración de handoffs.
- Logs correlacionados por `requestId`, sin contenido sensible innecesario.
- Runbook para fallos de Hermes, gateway, puertos, tokens revocados y fuentes inaccesibles.

**REQ-NF-005 — UX**
- Flujo guiado, usable en móvil y escritorio.
- El usuario debe saber qué cargar, qué falta, qué está procesando Hermes y quién debe actuar.
- No ocultar pendientes después de una aprobación con observaciones o waiver.

## 3. Integración con el dashboard QA/control tower existente

### 3.1 Lo que ya existe — RESULTADO VERIFICADO

El repositorio local contiene una MVP funcional de Control Tower con:
- dashboard dinámico bajo `/dashboard`;
- KPIs ejecutivos y flujo CP/Delivery;
- colecciones para `initiatives`, `workItems`, `gates`, `evidences`, `handoffs`, `risks` y `activities`;
- módulos de QA, DevOps, negocio, riesgos, capacidad, usuarios y repositorios;
- API JSON read/write controlada;
- persistencia actual en `data/state.json`;
- pruebas Node `node:test` y chequeo sintáctico;
- integración Azure DevOps declarada como read-only/pending en el README.

El módulo QA actual está orientado a calidad, defectos y evidencia; el flujo solicitado por Mauricio requiere una capacidad nueva de *intake + enrichment + validation* que debe integrarse, no mezclarse sin modelo.

### 3.2 Propuesta de navegación

Agregar al menú principal:

- **Requerimientos** — bandeja y filtros por estado, owner, proyecto y prioridad.
- **Nuevo requerimiento** — formulario guiado de intake.
- **Detalle de requerimiento** — timeline, anexos, preguntas, versiones y acciones.
- **Enriquecimiento** — ejecución, agentes, progreso, errores y resultado.
- **QA derivado** — vista de cobertura, casos, evidencia y defectos.

Mantener los módulos existentes:
- Resumen ejecutivo.
- CP0–CP5.
- QA y defectos.
- DevOps/Release.
- Riesgos y bloqueos.
- Usuarios/asignaciones.
- Repositorios/alertas.

### 3.3 Modelo de datos propuesto

No ampliar `workItems` con campos ambiguos. Agregar colecciones o entidades explícitas:

- `requirements`: identidad, título, proyecto, estado, owner, prioridad, versión actual y enlace externo.
- `requirementSources`: archivo/URL, tipo, hash, clasificación, estado de ingestión y relación con el requerimiento.
- `enrichmentRuns`: ejecución, versión, estado, agentes, timestamps, errores y artefactos generados.
- `requirementQuestions`: pregunta, respuesta, estado, actor y versión.
- `requirementVersions`: snapshot inmutable del documento generado y sus fuentes.
- `requirementApprovals`: validación 1/2+, decisión, observaciones, actor y fecha.
- `requirementHandoffs`: origen, destino, estado, SLA, actor y motivo de devolución.
- `qaPackages`: vínculo entre requerimiento y artefactos QA.
- `qaCases` o adaptación explícita de `workItems`: escenario, precondiciones, datos, resultado esperado y estado.
- `auditEvents`: evento append-only con actor, objeto, acción y correlación.

Relaciones clave:

`requirement → source → enrichmentRun → version → question/criterion → qaPackage → qaCase → evidence → gate/handoff`

Para producción, evaluar PostgreSQL/object storage como fuente durable. El JSON actual es apropiado para el MVP controlado, pero no para anexos binarios, concurrencia alta, auditoría inmutable o multiusuario real.

## 4. Arquitectura objetivo por incrementos

### Incremento A — MVP local/controlado

- UI de intake y detalle.
- Identificador automático.
- Carga de archivos pequeños y registro de URL.
- Datos mock o adaptador controlado para Hermes.
- Preguntas, respuestas, versiones y validaciones manuales.
- Generación de documento Markdown/HTML.
- Paquete QA generado como datos internos.
- Sin mutaciones automáticas en Azure DevOps/Teams.

### Incremento B — Orquestación real

- Worker asíncrono separado del servidor web.
- Contrato de entrada/salida versionado para Hermes.
- Agentes especializados y verificador.
- Reintentos, idempotencia, DLQ o cola equivalente.
- Evidencia de cada ejecución y límites de coste/tiempo.

### Incremento C — QA integrado

- Convertir criterios y escenarios en casos QA trazables.
- Adjuntar evidencia y defectos al requerimiento.
- Actualizar KPIs del módulo QA y los Quality Gates de Control Tower.
- Incorporar el estado de QA al flujo general sin declarar cierre automático.

### Incremento D — Integraciones externas autorizadas

- Read-only Azure DevOps/Teams para consulta y enlace.
- Creación o actualización de work item solo después de aprobar contrato, permisos y rollback.
- Notificación por correo/Teams.
- SSO/RBAC y almacenamiento de objetos controlado.

## 5. Flujo UX propuesto

1. Wilson entra a **Requerimientos** y pulsa **Nuevo requerimiento**.
2. Captura título, contexto, proyecto, prioridad y responsable.
3. Carga anexos o pega URLs; cada fuente queda visible con estado de validación.
4. El sistema crea `REQ-XXXX` y conserva el original.
5. Pulsa **Enriquecer historia**.
6. El portal muestra progreso por etapa/agente y no bloquea la navegación.
7. Se presentan preguntas encontradas; Wilson responde o devuelve información.
8. Se genera versión enriquecida `v1`; se ejecuta Validación 1.
9. Las observaciones generan nueva versión y mantienen la anterior.
10. Validación 2 aprobada habilita **Enviar a QA**.
11. QA revisa casos, datos, evidencia y defectos desde el módulo ya existente.
12. Con gate QA aprobado, se habilita **Enviar a Diseño** y después **Enviar a Desarrollo**.
13. El detalle muestra el estado final, enlaces externos y toda la trazabilidad.

## 6. Roles y RACI preliminar

- **Accountable:** Mauricio/PO — valida el flujo, alcance y reglas de negocio.
- **Responsible intake/orquestación:** Rogelio/Desarrollo — portal, workers, Hermes y operación.
- **Responsible contexto funcional:** Wilson — crea/revisa historias y responde preguntas.
- **Responsible QA:** QA Lead — valida escenarios, evidencia y Quality Gate.
- **Consulted:** Diseño, DevOps/SRE, Seguridad/Privacidad, dueño de Teams/Azure DevOps.
- **Informed:** stakeholders definidos por proyecto.

Este RACI es propuesto y debe ser confirmado antes del desarrollo.

## 7. Backlog inicial priorizado

### P0 — Demostrable en el primer incremento

- `P0-01` Contrato de requerimiento y máquina de estados.
- `P0-02` Login/RBAC mínimo para Wilson y Admin.
- `P0-03` Crear `REQ-XXXX`.
- `P0-04` Adjuntar PDF/Markdown/imagen y registrar URL.
- `P0-05` Ver detalle, anexos y timeline.
- `P0-06` Botón de enriquecimiento con adaptador controlado.
- `P0-07` Preguntas/respuestas y versiones.
- `P0-08` Documento enriquecido con criterios, escenarios y datos.
- `P0-09` Paquete QA visible desde el requerimiento.
- `P0-10` Pruebas API/UI del camino feliz y errores básicos.

### P1 — Operación real

- `P1-01` Worker asíncrono e idempotencia.
- `P1-02` Agentes especializados + verificador.
- `P1-03` Handoffs, SLAs y devoluciones.
- `P1-04` Evidencia QA real conectada al módulo actual.
- `P1-05` Observabilidad y runbooks.
- `P1-06` Object storage y escaneo de anexos.

### P2 — Integraciones

- `P2-01` Consulta de Teams/Azure DevOps por URL o API autorizada.
- `P2-02` Crear/anexar documento al ticket externo.
- `P2-03` Notificaciones por correo/Teams.
- `P2-04` SSO, multi-proyecto y políticas de retención.

## 8. Criterios de aceptación del MVP

- `AC-01`: Wilson autenticado crea un requerimiento y recibe un ID único.
- `AC-02`: El sistema acepta los formatos acordados y rechaza extensiones/tamaños no permitidos con mensaje accionable.
- `AC-03`: Una URL inaccesible queda en `ERROR/PENDIENTE`; nunca se presenta como procesada.
- `AC-04`: La acción de enriquecimiento genera una ejecución identificable y conserva el original.
- `AC-05`: La salida contiene preguntas, criterios, escenarios y datos de prueba o marca explícitamente los faltantes.
- `AC-06`: Cada pregunta puede responderse y queda versionada con actor y fecha.
- `AC-07`: No se puede enviar a QA con preguntas bloqueantes o sin documento vigente aprobado.
- `AC-08`: QA puede consultar el paquete derivado y registrar PASS/PENDING/FAIL/BLOCKED con evidencia.
- `AC-09`: Una devolución desde QA o Diseño retorna al estado correcto y conserva el motivo.
- `AC-10`: La interfaz muestra owner, siguiente acción, estado y trazabilidad sin depender del chat.
- `AC-11`: Los tests cubren creación, adjuntos, error de fuente, reintento, versionado, aprobación y handoff.
- `AC-12`: No se declara cerrado el requerimiento sin aprobación humana y Quality Gate aplicable.

## 9. Riesgos y decisiones pendientes

- **Fuente de verdad:** decidir si el ticket canónico será Azure DevOps, Teams o el portal; inicialmente se recomienda portal como intake y enlace externo como referencia.
- **Teams:** confirmar si se leerá una URL pública, una API autenticada o un archivo exportado. No diseñar scraping como contrato principal.
- **Archivos grandes/video:** definir almacenamiento, transcripción, límites y coste antes de habilitarlo.
- **Credenciales:** definir SSO/RBAC y vault; no usar usuario/password compartido para producción.
- **Hermes:** confirmar API/CLI, perfiles, agentes disponibles, contratos y límites; no asumir que una conversación equivale a una integración estable.
- **Aprobación:** Mauricio debe confirmar quién aprueba Validación 1/2, QA, Diseño y el handoff a Desarrollo.
- **Cliente/tenant:** separar proyectos, documentos y permisos; no mezclar información de clientes.
- **Persistencia:** decidir cuándo migrar de `state.json` a base durable y almacenamiento de objetos.
- **Publicación:** definir si el portal será privado o público; el MVP debe ser privado por defecto.
- **SLA:** acordar tiempos de respuesta por etapa; no inventar umbrales en código.

## 10. Plan de ejecución sugerido

### Fase 0 — Alineación y contrato

**Salida:** SPEC aprobable, estados, roles, formatos, límites, RACI y decisiones de integración.

- Validar este inventario con Mauricio y Wilson.
- Confirmar el primer caso de uso real y un set de anexos no sensibles.
- Definir qué significa “listo para QA” y “listo para desarrollo”.

### Fase 1 — Vertical slice sin integraciones externas

**Salida:** flujo completo local/controlado desde crear requerimiento hasta paquete QA.

- Modelo de datos y endpoints.
- UI responsive.
- Adaptador de enriquecimiento controlado.
- Versionado, preguntas, validación y documento.
- Integración visual con módulo QA existente.
- Tests automatizados y datos de demo aislados.

### Fase 2 — Hermes/orquestador real

**Salida:** ejecución verificable y recuperable.

- Contrato versionado.
- Worker y estados de job.
- Agentes de análisis y verificación.
- Observabilidad, reintentos y manejo de fallos.
- Pruebas con anexos autorizados.

### Fase 3 — QA operativo y handoffs

**Salida:** trazabilidad de criterios a casos, evidencia, defectos y gates.

- Crear paquete QA derivado.
- Registrar evidencia y defectos.
- Configurar handoffs Wilson → QA → Diseño → Desarrollo.
- Validar métricas y cierre humano.

### Fase 4 — Integraciones gobernadas

**Salida:** conectores autorizados y auditables.

- Azure DevOps/Teams read-only primero.
- Después, si se aprueba, escritura limitada con permisos mínimos, verificación de lectura posterior y rollback.
- Notificaciones y exportaciones.

## 11. Evidencia requerida para declarar avance

- `PROPUESTO`: este plan y SPEC pendiente de aprobación.
- `GENERADO`: código, esquema, UI o documentos creados.
- `EJECUTADO`: pruebas y flujo real ejecutados con salida observable.
- `VERIFICADO`: lectura posterior de estados, artefactos, trazabilidad y tests exitosos.
- `PENDIENTE`: decisiones, credenciales, integraciones o aprobaciones faltantes.

No debe presentarse un mock, semilla JSON o enriquecimiento simulado como resultado de Hermes real.

## 12. Próxima acción recomendada

Realizar una sesión corta de validación con Mauricio y Wilson para aprobar únicamente:

1. estados y responsables;
2. formatos/límites de anexos;
3. fuente de verdad y destino del documento;
4. criterios de “listo para QA”;
5. roles de aprobación;
6. primer caso de prueba no sensible.

Con esas seis decisiones aprobadas, el siguiente entregable técnico debe ser un vertical slice dentro de `mobilityapps-dashboard-control-tower`, sin modificar todavía Azure DevOps, Teams, Hermes productivo ni credenciales.
