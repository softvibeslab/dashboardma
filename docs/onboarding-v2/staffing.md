# Integración de Etapa 2 con clasificaciones — contrato y controles

## Estado de publicación
La conexión se publicó y verificó; ver `staffing-publication.md` para release, pruebas, límites y configuración real pendiente. La existencia de código conectado no significa que haya frentes/participaciones o usuarios autorizados configurados.

## Alcance
Conectar selección gobernada de frentes, proyecto, responsable desarrollador y revisor independiente al catálogo y la copia Azure. No incluye ranking/carga/capacidad, escritura Assigned To, creación de tareas Azure, ni alta automática de permisos. El listado público reducido de nombres/frentes no se amplía con información privada.

## Contrato de opciones autenticadas
Con `V2_STAFFING_REQUIRED=true`, el estado V2 incluye `staffing` y `GET /api/staffing` entrega el mismo descriptor:

- `required`, `catalogRevision` (texto), `directorySyncedAt`, `token` y `warning`.
- `fronts`: IDs y nombres de frentes activos.
- `projects`: proyectos observados en la fuente Azure sanitizada.
- `candidates`: userId, name, frontId, project, roles de participación, level y preparación de vínculo (`canConfirm`, `canReview`).

Solo participan relaciones habilitadas, frente activo, identidad presente en la copia y proyecto incluido tanto en la participación como en la fuente. Responsable requiere participación developer; revisor requiere reviewer y ser otra identidad. Un usuario puede estar sincronizado y no tener clasificación: no se inventa un candidato.

La fuente es la proyección privada configurada, no una llamada Azure en vivo. Leer opciones no importa usuarios, modifica clasificaciones ni confirma responsabilidad.

## Selección y persistencia
La fase 2 envía `catalogToken` y `fronts` con ID local, catalogFrontId, project, owner/reviewer Azure IDs y entregable/repositorio/área/contrato/dependencias. El servidor valida contra el catálogo y deriva disciplina, nombres, revisión/fecha de origen y `selectionToken` por frente. Campos declarados por el cliente no prueban identidad ni confirmación.

Las revisiones de catálogo y el contenido de opciones forman un hash de selección. Una modificación de catálogo, elegibilidad, copia relevante o vínculos de acceso hace cambiar ese token. Se exige revisión y guardado explícitos; no se sustituyen silenciosamente responsables. Revisiones desactualizadas rechazan la escritura con 409.

## Identidad y confirmación
Identidades Azure del directorio y usuarios RBAC de V2 son conceptos distintos. Para confirmar responsabilidad o revisar un frente se requiere un vínculo explícito `azureIdentityKey` en la configuración privada de la identidad RBAC verificada por tid+oid. No inferir ese vínculo por nombre o correo, ni conceder un rol por seleccionar una persona en el catálogo. Cada Azure key puede vincularse a una sola identidad de acceso.

Un candidato sin vínculo puede seleccionarse, pero no se presenta como capaz de confirmar/aprobar hasta que exista asociación explícita y el rol requerido. La selección sigue pendiente hasta que el responsable autenticado con rol editor confirme. El revisor de frente requiere rol reviewer y su vínculo correspondiente. Revisiones documentales/QA generales conservan la asignación RBAC existente.

Las confirmaciones registran actor y fecha del servidor; no se aceptan valores de confirmación falsificados del cliente. Cambios materiales del frente o su token invalidan la confirmación y revisiones dependientes sin borrar historial.

## Gates e integridad
El servidor vuelve a validar el catálogo antes de confirmar, revisar, aprobar, recibir o exportar paquetes. La lectura del estado muestra bloqueos si la selección histórica perdió vigencia, sin modificar datos por una consulta GET. El paquete conserva la procedencia del catálogo y las identidades seleccionadas.

Escrituras del catálogo y operaciones gobernadas de estado comparten una cola de snapshot dentro del proceso. El reemplazo de la copia Azure por un exportador externo no es una transacción ACID entre sistemas; cada operación valida una instantánea y su token. La solución sigue usando un único escritor Node por archivo y no soporta coordinación multiproceso externa.

## Configuración de publicación
Aplicar `deploy/staffing.override.yml` junto con base, fuente de clasificaciones y consulta pública, conservando el mismo volumen y RBAC. No crear clasificaciones, asignaciones o vínculos durante el despliegue para hacer parecer completo un catálogo vacío. Si no existen frentes/participaciones, la interfaz debe indicarlo y enlazar a su administración.

Modo legacy sin flag se conserva para compatibilidad/regresión. En la publicación nueva se debe comprobar el flag verdadero y el módulo correcto por hash, además de proteger GET /api/staffing, escrituras y confirmaciones anónimas.

## Evidencia antes del cierre
Pruebas backend TDD implementadas: opciones/eligibilidad, procedencia derivada en servidor, token desactualizado, independencia de revisor, vínculo explícito, confirmación auditada e imposible de falsificar, gates HTTP y serialización de snapshot. La publicación y el recorrido real frontend+backend requieren el informe final de esta entrega; la existencia de este contrato no acredita despliegue ni integración externa ejecutada.
