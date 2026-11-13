# Módulo de clasificaciones y participación

## Estado y ubicación
Implementado y probado en rama `feature/classification-participation`, carpeta `/root/workspaces/dashboardma-classifications`. El módulo fue publicado después de la validación inicial; ver `classifications-publication.md` para release, controles verificados y habilitación de coordinador todavía pendiente.

Entrada publicada: https://iamobilityappsinc.com/dashboard/onboarding-v2/classifications. El encabezado del onboarding enlaza al módulo. El acceso conserva el RBAC explícito existente; disponer de una identidad Azure en la fuente no concede acceso a V2.

## Funcionalidad
- CRUD de frentes: nombre, descripción y activo/inactivo. ID estable generado por el servidor. Nombres únicos sin distinguir mayúsculas.
- CRUD de participación por identidad Azure y frente: principal/secundario, desarrollar/revisar/apoyar (combinables), proyectos observados en la fuente y habilitación para nuevas asignaciones, con observaciones.
- Una relación por persona/frente; como regla inicial, máximo un frente principal habilitado por persona, transversal a proyectos.
- Filtros por persona, frente, proyecto, tipo de participación y habilitación.
- El coordinador confirma cada registro al guardarlo. La clasificación no concede roles de acceso ni prueba especialidad o disponibilidad real.
- Historial con actor, fecha, revisión y valores antes/después. Eliminar un registro conserva su historial.
- Un frente con participaciones no puede eliminarse: desactivar o retirar primero las relaciones. Una participación puede retirarse sin borrar la identidad Azure.
- Escritor único, cola y reemplazo atómico; revisión optimista bloquea sobrescrituras de sesiones desactualizadas. No es una base de datos multiproceso ni una bitácora externa inmutable.

## Acceso e integridad
Usa las sesiones y el RBAC explícito de V2. Lectura para usuarios autorizados; cualquier cambio y la importación de directorio requieren `coordinator`. El control se aplica en servidor, no solo en botones. Los POST verifican el Origin exacto existente. No se otorgan permisos por email declarado ni por pertenencia al catálogo. No se escriben datos en Azure.

## Fuente Azure: frontera real
El módulo importa una proyección autorizada de la copia Azure existente. No llama directamente a Azure, no actualiza el upstream ni consulta capacidad, vacaciones o carga. La pantalla identifica explícitamente que trabaja con copia y muestra fecha de sincronización de origen y fecha de importación al catálogo.

Exportación desde un snapshot autorizado, ejecutada por el operador:

    node scripts/export-v2-azure-directory.js /ruta/privada/state.json /ruta/privada/azure-directory.json

Solo exporta identidades con `syncSource=azure-devops` y `azureIdentityKey`: ID estable, nombre, correo y proyectos observados. No exporta backlog, requerimientos, adjuntos, tokens ni credenciales. Deduplica por identidad, conservando proyectos. Requiere fecha `meta.azureSync.syncedAt`; no inventa frescura. Salida con permisos 600.

Configurar `V2_AZURE_DIRECTORY_FILE` con el archivo sanitizado. Desde la UI, el coordinador pulsa “Actualizar usuarios desde la copia de Azure”. El cliente no puede suministrar otro directorio ni una ruta arbitraria. Para refrescar los datos primero debe actualizarse el upstream por su mecanismo autorizado y luego regenerarse la proyección. No se configuró tarea automática ni conector Azure en tiempo real.

En Docker, montar únicamente el directorio sanitizado read-only y dar permisos de lectura al UID de node (sin hacerlo público); no montar el archivo completo de estado productivo. Si el exportador usa rename atómico, montar el directorio sanitizado, no un archivo cuyo inode quede fijado. No versionar estos datos.

## API
`GET /dashboard/onboarding-v2/api/classifications` devuelve catálogo, autorización de gestión, identidad de sesión y si la fuente está configurada. No expone la ruta privada del archivo.

`POST .../api/classifications` usa `revision` y `type`:
- `front.create`, `front.update`, `front.delete`.
- `participation.create`, `participation.update`, `participation.delete`.
- `directory.sync` (sin datos de usuarios suministrados por cliente).

`data` se valida por allowlist. Update/delete requieren `id`. Revisiones en conflicto devuelven 409; no autorizado 401/403; falta de fuente configurada 503.

## Persistencia y ejecución
`V2_CLASSIFICATION_FILE` opcional: por defecto `classifications.json` al lado del archivo de estado V2, separado del expediente. Crear datos dentro de directorios privados excluidos de Git.

    npm run setup:v2
    V2_REVIEW_USERS_FILE=<archivo privado de identidades de prueba> V2_DATA_FILE=<estado aislado> V2_AZURE_DIRECTORY_FILE=<proyección autorizada> V2_BASE_PATH=/dashboard/onboarding-v2 V2_PORT=<puerto loopback libre> npm start

El modo de revisión local no debe publicarse ni considerarse autenticación corporativa. La configuración pública debe conservar `V2_AUTH_MODE=sso`, `V2_PUBLIC_ORIGIN` HTTPS y RBAC explícito.

## Verificación ejecutada
- `npm test`: 143 pruebas aprobadas, 0 fallos, 0 omitidas. Incluye 6 nuevas pruebas del módulo.
- Python: 22 pruebas OK.
- `npm run check:v2`, `npm run check` y comprobaciones sintácticas específicas correctas.
- Chromium real: creación/edición/eliminación de frentes y participaciones, importación de directorio sintético, filtros, persistencia tras recarga, retiro de una identidad ausente de la última copia y revisión 1440x1000 / 390x844. Evidencias sintéticas en `/root/.hermes/cache/scratch/classifications-browser-rhRhCy/`.
- Pruebas HTTP: SSO, lector sin permisos de escritura, bloqueo de otro Origin, conflicto 409 y estado del expediente sin alteración.
- Proyección probada realmente contra el snapshot local autorizado: 28 identidades únicas; únicamente campos permitidos; salida privada con permisos 600. No es una consulta Azure en vivo ni una prueba de usuarios vigentes.
- Detector visual: sin hallazgos mecánicos; no se afirma certificación WCAG ni pentest integral.

## Pendiente para siguientes etapas
Autorizar coordinadores explícitos e importar la fuente sanitizada desde una sesión autorizada; conectar el catálogo como selector gobernado de la fase 2; consultar carga/capacidad real y construir recomendaciones explicables. La rama y el módulo ya se publicaron, con el directorio sanitizado montado read-only; ver `classifications-publication.md`. Los frentes y participaciones no modifican Assigned To ni crean tareas en Azure en esta entrega.
