# MobilityApps Ecosystem Control Tower — MVP funcional

URL pública:

- https://iamobilityappsinc.com/dashboard

## Estado

MVP funcional con:

- API JSON read/write controlada.
- Persistencia en `data/state.json`.
- Dashboard dinámico bajo `/dashboard`.
- KPIs ejecutivos.
- Flujo CP / Delivery.
- Iniciativas, work items, Quality Gates, evidencias, handoffs, riesgos y actividades.
- Registro manual de actividades desde la UI.
- Pruebas automatizadas Node `node:test`.

## Alcance real

`RESULTADO VERIFICADO`:

- El MVP corre como servicio Node detrás de Traefik.
- El endpoint público de salud responde `200 OK`; las páginas redirigen al login cuando no hay sesión y la autenticación está configurada.
- `/dashboard/api/summary` y las colecciones requieren sesión cuando la autenticación está configurada.
- La copia de Azure DevOps se alimenta mediante sincronización read-only y puede buscarse en Requerimientos.

`PENDIENTE`:

- Búsqueda en tiempo real contra Azure DevOps Boards desde el dashboard.
- Mapeo oficial de estados Azure ↔ CP0–CP5.
- Autorización granular por rol/proyecto (el login de Entra ya está conectado).
- Integraciones Sentry, pipelines y evidencias QA reales.
- Aprobaciones humanas formales con bitácora append-only.

## Sesión y búsqueda en Requerimientos

- `/dashboard` y `/dashboard/requirements` muestran el estado real de `/dashboard/api/auth/status`: sesión iniciada con nombre/correo, sin sesión o autenticación no configurada. Incluyen cierre de sesión y comprobación al volver a la pestaña y cada minuto.
- `GET /dashboard/api/azure/work-items` busca solo registros con `syncSource=azure-devops` de la copia sincronizada; no consulta Azure en tiempo real ni usa el secreto de Entra como credencial de Azure DevOps.
- Parámetros: `q` (ID, título, responsable, etiquetas), `project`, `state`, `limit` (1–50; predeterminado 20), `offset`. Devuelve `total`, `hasMore`, proyectos/estados y `syncedAt` para hacer visible la frescura del dato.
- La ruta utiliza la misma protección de sesión del resto del dashboard.
- “Abrir en Azure” navega a Azure DevOps, donde se aplican sus propios permisos. “Usar como requerimiento” solo prepara el formulario; el usuario debe revisar y crear. Se conserva la URL de origen como fuente al crear, sin escribir en Azure.
- El inicio de sesión identifica al usuario, pero no implementa autorización por proyecto/rol: los usuarios con acceso al dashboard comparten la copia sincronizada existente.
- `.env.auth` no debe versionarse ni incluirse en el contexto de construcción Docker. Actualizar sus variables requiere recrear el contenedor; un simple `restart` no recarga `env_file`.

## Enriquecimiento real con Hermes / Ecosistema de IA

- En el detalle, “Enriquecer con Hermes” crea un job durable y responde `202`, sin resultados simulados. El botón muestra cola/ejecución y consulta el progreso cada cinco segundos.
- `mobilityapps-requirements-hermes.service` procesa una tarea a la vez en el VPS; no abre puertos y no necesita Docker socket. La aplicación Node guarda el estado; el worker solo publica resultados en `data/enrichment-jobs`.
- Usa el modelo/proveedor configurado en Hermes, sin cambiar su configuración. Resuelve las credenciales únicamente en el host; el motor recibe la conexión por un pipe y usa un Hermes home exclusivo en `.runtime/hermes-enrichment`. La resolución OAuth puede refrescar el almacén del proveedor. No se reinician ni reconfiguran gateways, bridges de mensajería u otros perfiles.
- Dos pasadas reales: analista CP0/CP1 con el método `mobilityapps-cp0-cp1-hu-enrichment` y revisor crítico independiente. Cada agente se verifica sin herramientas, memoria global, archivos de contexto ni background review. El subproceso del motor tiene un plazo de 300 segundos.
- Contexto permitido: título/descripción/proyecto del requerimiento, hasta diez fuentes y metadatos de repositorios del mismo proyecto. Se extrae texto de TXT/Markdown/CSV de hasta 50 KB, con un presupuesto de contexto acotado y redacción de patrones comunes de credenciales. El usuario debe excluir secretos de sus fuentes; esa redacción no sustituye una política DLP.
- URLs no se consultan. PDF, Office, imágenes, video, OCR, transcripción, código y memorias/Graphify no están conectados a esta ruta y quedan PENDIENTES. No se afirma haber leído fuentes que solo tienen metadatos. La integración usa el método del Ecosistema de IA; no implica que todo su catálogo de agentes/herramientas esté conectado.
- Solo una salida con contrato completo, `toolsCount=0`, revisión crítica y hash de entrada coincidente crea la versión, preguntas y paquete QA en una transacción local. Las versiones anteriores y el texto original se conservan. Si la fuente cambió, se señala para revisión.
- Los resultados son `PROPUESTO`, las versiones `draft`, los casos QA no ejecutados y CP2/las aprobaciones humanas permanecen pendientes. No se escribe en Azure, no se ejecuta desarrollo ni se despliega por instrucciones del requerimiento.
- Se admiten cinco tareas activas y cuarenta solicitudes al día para el dashboard. Fallos/interrupciones requieren reintento explícito; no hay reintentos automáticos de llamadas pagadas. Si el worker no está disponible, se devuelve `503`.
- Los artefactos generados no pueden modificarse por el CRUD genérico cuando esta integración está habilitada. El control de acceso sigue siendo la sesión compartida existente; RBAC granular y persistencia multi-proceso siguen pendientes. La serialización y escritura atómica de `JsonStore` no coordinan escritores externos al proceso Node.

Operación:

```bash
systemctl status mobilityapps-requirements-hermes.service
journalctl -u mobilityapps-requirements-hermes.service -n 30 --no-pager
```

Desactivar: detener el worker y poner `ENRICHMENT_ENABLED=false` en Compose, recreando solo `dashboard`. No borrar `data/enrichment-jobs` para ocultar errores. Mantener `.runtime`, `.env*` y jobs fuera del contexto Docker.

## Chat contextual, discusión y adjuntos por requerimiento

- En `/dashboard/requirements`, selecciona un requerimiento y usa “Abrir chat con Hermes”. El popup queda fijado a ese ID; no cambia de contexto silenciosamente al cambiar la selección. Cada pregunta utiliza una instancia nueva, sin herramientas, y un snapshot limitado del requerimiento, su última versión, preguntas/respuestas registradas, conversación privada propia y comentarios recientes del equipo. No implica lectura completa de repositorios, archivos binarios ni URLs.
- El historial del chat es privado por identidad de sesión y requerimiento. “Limpiar mi chat” elimina ese historial local terminado, no el foro ni los contadores de uso. Las consultas enviadas al proveedor están sujetas a su política de retención. El foro es compartido por los usuarios con acceso al dashboard, con autor y fecha asignados por el servidor; comentar no equivale a aprobar.
- “Adjuntos en Azure DevOps” consulta metadatos reales mediante “Consultar Azure”, sin escribir en Azure. Requiere una fuente con la URL de un ticket de la copia sincronizada de confianza. Usa “Usar como requerimiento” en el buscador para conservar ese vínculo. El worker resuelve la credencial read-only solo en el host, limita el origen a la organización permitida y no sigue redirecciones. Los enlaces se abren bajo los permisos de la cuenta Azure del navegador; imágenes incrustadas en la descripción pueden requerir abrir el ticket.
- “Fuentes y anexos del dashboard” muestra las fuentes locales y permite “Descargar archivo local”. Subir un archivo aquí no lo adjunta a Azure. La descarga valida el directorio real del requerimiento y fuerza descarga, sin servir contenido activo inline.
- API: `GET/POST/DELETE /dashboard/api/requirements/:id/chat`, `GET/POST .../:id/discussion`, `GET/POST .../:id/azure-attachments` y `GET .../:id/sources/:sourceId/download`. Chat y discusión usan `clientRequestId` para evitar duplicados por reintentos. La interfaz no crea consultas pagadas automáticamente al abrir el popup.
- Chat: máximo cinco respuestas activas, cuarenta preguntas por identidad/día y doscientas para el dashboard/día. Contexto de hasta seis intercambios previos y seis comentarios recientes; se muestran hasta cuarenta mensajes propios. El piloto limita almacenamiento y frecuencia de comentarios y consultas Azure; no hace reintentos automáticos de llamadas al modelo.
- Persistencia privada separada en `data/requirement-workspace.json`, excluida del contexto Docker junto con sus temporales. La cola comparte `data/enrichment-jobs` con el worker existente, sin abrir nuevos puertos. Incluir esos archivos en la política de retención y backups confidenciales. La autorización granular por proyecto sigue pendiente: el foro y el backlog continúan compartidos entre usuarios autorizados del dashboard.

## Preguntas y respuestas con revisión humana

- La sección independiente “Preguntas y respuestas” permite registrar preguntas, guardar borradores, pedir a Hermes ayuda para responder o enriquecer el texto, rechazar propuestas y aprobar explícitamente una respuesta. Las preguntas y respuestas de esta sección son compartidas; no se mezclan con el chat privado del usuario.
- Las sugerencias son ejecuciones reales del worker existente, sin herramientas. El contexto incluye la pregunta específica, el borrador visible, indicaciones opcionales y el contexto acotado del requerimiento. Generar nunca aprueba: el resultado queda como `suggested` y la pregunta continúa abierta.
- La aprobación registra identidad del servidor, fecha, revisión, versión y SHA-256 del texto aceptado. Editar una respuesta aprobada crea un nuevo borrador y requiere nueva aprobación; se conserva el historial previo. Aprobar una respuesta no aprueba la especificación, el requerimiento ni un CP.
- La revisión esperada impide decisiones sobre una respuesta modificada por otra persona. Una sugerencia que llega después de editar el borrador o cambiar el contexto no sustituye esos cambios y queda obsoleta. El CRUD genérico no permite crear, editar ni borrar preguntas para eludir el flujo.
- Los siguientes enriquecimientos reciben hasta diez respuestas aprobadas, con evidencia de aprobación y advertencia de validar su compatibilidad con cambios de contexto. No se incluyen borradores como decisiones aprobadas ni se modifican versiones anteriores de la especificación.
- API: `GET /dashboard/api/requirements/:id/answers`, `POST .../:id/questions` y `POST .../:id/questions/:questionId/answer` con `action`, `expectedRevision`, `text` e `instruction` según la acción. El acceso sigue la sesión compartida actual, sin una matriz nueva de permisos por rol. El historial se protege en la API, no constituye un registro externo firmado o inmune a administradores/escritores del archivo de estado.

## Guía paso a paso por tecnología y área

- `/dashboard/requirements/onboarding` permite seleccionar un requerimiento o recibir `?requirementId=ID`. La bandeja y el detalle del flujo visual incluyen “Abrir guía paso a paso”. Se conserva el diseño aprobado; el asistente es una página independiente con etapas, bloqueos y botones Anterior/Siguiente.
- El inicio del onboarding incluye un buscador único por ID, título o responsable sobre la copia sincronizada de Azure (no tiempo real), con fecha de sincronización y paginación. “Agregar a bandeja y continuar” importa y selecciona automáticamente el requerimiento, sin un segundo formulario ni llamadas pagadas a Hermes.
- `POST /dashboard/api/requirements/import-azure` recibe solo `workItemId`; los datos y la URL se toman del registro sincronizado del servidor. Crea el requerimiento y su fuente en una transacción local, reutilizando un requerimiento ya vinculado al mismo ticket incluso ante solicitudes simultáneas. No sobrescribe su contenido revisado ni escribe en Azure. La copia actual no incluye la descripción completa ni criterios del ticket: la interfaz lo advierte y conserva el enlace para completar contexto antes del enriquecimiento.
- Etapas: Enriquecimiento → Tecnologías y áreas → Specs → Validación documental → Pruebas y evidencias → Firmas → Megaprompt y entrega. El servidor persiste y comprueba cada transición; cambiar el texto de estado en el tablero anterior no salta estos controles.
- La etapa inicial integra edición de contexto, carga/listado/descarga de archivos, URLs y generación explícita con Hermes, sin salir del onboarding. Reutiliza el componente compartido de preguntas y respuestas para ayuda de Hermes, borradores, rechazo, aprobación e historial. Los mismos registros se ven en la bandeja; no existe una segunda copia de respuestas. El progreso actualiza versiones y bloqueos sin remontar los editores durante el polling. Las versiones nuevas requieren selección/guardado explícitos; no se cambia silenciosamente una versión anterior. Los archivos cargados son locales y las fuentes no extraídas siguen pendientes; registrar una URL no la descarga.
- En el enriquecimiento del onboarding, “Fuentes de Azure DevOps” muestra el ticket vinculado y los metadatos de sus adjuntos mediante el mismo adaptador autorizado de la bandeja. Al abrir, consulta el estado local; “Consultar/Actualizar adjuntos” solicita la lectura real. Muestra enlaces para abrir ticket/adjuntos con la sesión Azure del navegador, fecha, estados, lista parcial y errores. No descarga contenido para Hermes ni equivale a un visor inline de PDF/Office. El panel conserva los editores y descarta respuestas tardías tras cambiar de requerimiento.
- Las preguntas se muestran como acordeones nativos inicialmente contraídos, con título y estado Aprobada/Pendiente siempre visibles. La expansión y los borradores se conservan por requerimiento durante actualizaciones y decisiones.
- En Tecnologías y áreas, “Consultar a Hermes” genera una propuesta real con tecnología, área, correo candidato, confianza y justificación. Solo admite correos de usuarios Azure sincronizados del proyecto y referencias a sus asignaciones; ninguna asignación prueba especialidad ni disponibilidad. Si falta evidencia, queda pendiente. “Aplicar al editor” requiere confirmación y no guarda ni altera roles, QA/Negocio o firmas; el usuario corrige y pulsa el guardado normal. Ver `docs/technology-suggestion.md` para API, cuotas y controles de integridad.
- El origen es una versión enriquecida del requerimiento; sus preguntas deben tener respuesta aprobada. Se seleccionan de uno a ocho frentes con tecnología, área y correo del responsable, más QA y Negocio. No se adivina el stack. Solo se incorporan las respuestas de la versión elegida, sin desplazarla con versiones antiguas: hasta treinta preguntas; si excede el alcance o el presupuesto de contexto, se bloquea explícitamente en vez de omitir información.
- “Generar todas las specs con Hermes” ejecuta realmente una pasada sin herramientas y exige una spec por cada frente exacto. Cada documento incluye alcance, reglas, datos, integraciones, seguridad, criterios, pruebas propuestas, dependencias y pendientes. Generar no implementa software ni ejecuta pruebas funcionales. Los faltantes quedan pendientes y los repositorios no inspeccionados no se describen como leídos.
- La validación automática comprueba estructura, cobertura de frentes, contexto vigente y referencia mínima a criterios del origen. No demuestra corrección semántica exhaustiva, seguridad del código ni calidad de una implementación. El megaprompt final también recibe comprobaciones de integridad textual, frentes, hash y tamaño.
- Las pruebas funcionales se reportan por usuarios con criterio, riesgo, pasos, esperado, observado, resultado y URL HTTPS o fuente adjunta. Se exige declaración explícita del responsable del reporte y al menos el último reporte aprobado por cada frente. No se descargan ni verifican automáticamente las evidencias, no se ejecutan comandos desde el dashboard y no se afirma cobertura total. Subir nuevas fuentes cambia el contexto; conviene separar previamente las fuentes o usar enlaces de evidencia para evitar una regeneración inesperada.
- Las aceptaciones se registran por rol, sobre el hash exacto del paquete canónico que incluye artefacto, origen, frentes, validación, reportes y responsables. Solo el correo de la sesión asignado a ese rol puede aceptar o devolver. Un mismo correo con varios roles debe aceptar cada uno. Es aceptación interna autenticada, no firma digital cualificada ni un sustituto de controles legales. La asignación de responsables utiliza los permisos compartidos actuales; no agrega una matriz empresarial de autorización para asignar roles.
- Las versiones y paquetes revisados se conservan como snapshots; los cambios de origen, alcance, respuestas o evidencias invalidan la vigencia de las aceptaciones anteriores sin borrarlas. El megaprompt se habilita al final, en texto copiable/descargable, con hash del paquete y SHA-256 del texto separados. No autoriza ejecución, despliegues, aprobación global del requerimiento ni cierre de CP.
- API: `GET/POST /dashboard/api/requirements/:id/wizard`, POST con `action` y `expectedRevision`; exportación protegida `GET .../:id/wizard/export`. Los datos están en `data/requirement-wizards.json`, excluidos de Docker junto con sus temporales. La cola y el worker siguen siendo los existentes, sin nuevos puertos públicos.
- Límites del piloto: cinco generaciones activas, diez solicitudes por identidad/día y cuarenta globales/día, veinte versiones de specs y cuarenta snapshots de revisión por flujo, cien reportes por versión y doscientas aceptaciones por flujo. Los jobs propios terminados se retienen hasta siete días, doscientos archivos lógicos de job o cincuenta MiB; artefactos e historial durable permanecen aparte. La reconciliación global libera capacidad aunque nadie vuelva a abrir la página. No se eliminan jobs de chat/enriquecimiento ajenos a este módulo. La persistencia continúa siendo JSON y no resuelve transacciones ACID con escritores externos.

## Comandos

```bash
npm test
npm run check
PORT=4189 npm start
```

## API

- `GET /api/health`
- `GET /api/summary`
- `GET /api/:collection`
- `POST /api/:collection`
- `PUT /api/:collection/:id`
- `DELETE /api/:collection/:id`

Colecciones:

- `initiatives`
- `workItems`
- `gates`
- `evidences`
- `handoffs`
- `risks`
- `activities`

## Gobierno

La torre no reemplaza Azure DevOps. Consolida, mide y facilita decisiones. Las mutaciones hacia sistemas externos no están habilitadas en este MVP.
