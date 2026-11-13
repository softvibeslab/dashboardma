# Publicación del módulo de clasificaciones y participación

## Resultado verificado
- HTTPS: https://iamobilityappsinc.com/dashboard/onboarding-v2/classifications
- Acceso desde el encabezado de V2: https://iamobilityappsinc.com/dashboard/onboarding-v2
- Rama remota: `feature/classification-participation`.
- Release de aplicación/configuración: `c43844035884732b91f2927d521fbb7a088af20e`; imagen `dashboardma-onboarding-v2:c438440`.
- Contenedor V2 comprobado running/healthy, usuario node, sin puertos host publicados. El dashboard original no se recreó.

## Integridad y acceso
Se respaldó el volumen V2 en ubicación privada antes de recrear únicamente su contenedor. Los manifiestos de contenido antes/después coincidieron. Se conservaron el volumen, la sesión SSO y el archivo RBAC existentes, sin otorgar roles nuevos.

La lista RBAC tiene cero identidades autorizadas. Publicación no equivale a habilitación de usuarios: hace falta que el operador verifique la identidad corporativa y autorice explícitamente al coordinador. La pertenencia al catálogo de Azure no concede acceso al dashboard.

Después de iniciar sesión desde V2, `/dashboard/onboarding-v2/api/access` permite obtener solo la propia identidad firmada y su estado de asignación. No es necesario compartir contraseñas ni tokens. No se probó una sesión Entra real con rol coordinador durante esta publicación.

## Fuente de usuarios Azure
Se generó una proyección sanitizada del snapshot autorizado: 28 identidades, con la fecha de origen `2026-11-13T22:56:17.104Z`. Se verificó su lectura desde el usuario node del contenedor. Solo se montó el directorio sanitizado read-only, no el estado operacional completo. La proyección incluye ID, nombre, correo y proyectos; no backlog ni credenciales.

La fuente está configurada, pero no se ejecutó una importación en nombre de un coordinador inexistente. Tras autorizarlo, puede pulsar “Actualizar usuarios desde la copia de Azure” para incorporar la fuente al catálogo. No se configuró refresco automático, no es una llamada Azure en vivo y no demuestra disponibilidad de los usuarios.

## Verificaciones ejecutadas
- Pruebas específicas del módulo antes de publicar: 6 aprobadas, 0 fallos, 0 omitidas. Incluye Chromium escritorio/móvil, CRUD, filtros, persistencia y retiro de identidades ausentes.
- Validación sintáctica `npm run check:v2`: correcta.
- Regresión de la implementación funcional: 143 pruebas Node y 22 Python aprobadas (documentada en `classifications.md`). El cambio posterior añade únicamente el override de despliegue.
- Push y lectura de la rama remota: hash c438440 coincide con la aplicación/configuración desplegada.
- HTML y assets del módulo por HTTPS: 200; JS/CSS coinciden por hash con los archivos locales.
- Encabezado de V2 contiene el enlace prefijado al módulo.
- API de clasificaciones y estado sin sesión: 401. POST de otro Origin: 403.
- Pantalla de acceso del módulo observada en navegador real por HTTPS; no se simuló una sesión corporativa.
- Salud original `/dashboard/api/health`: 200; onboarding original conserva su redirección 302 a login.

## Operación
Aplicar `deploy/onboarding-v2.compose.yml` junto con `deploy/classifications.override.yml`. Inyectar desde el entorno del operador las rutas privadas `V2_SSO_ENV_FILE`, `V2_ROLES_FILE`, `V2_AZURE_DIRECTORY_HOST` y la etiqueta `V2_RELEASE` de la release deseada. No imprimir `docker compose config` completo ni variables secretas.

Actualizar upstream por su mecanismo autorizado y regenerar la proyección para refrescar la fuente; después importar desde la UI con un coordinador. Mantener permisos de lectura para UID node sin hacer públicos los datos. Si se reemplaza atómicamente el archivo, montar el directorio, no fijar un inode de archivo.

Rollback: recrear únicamente el contenedor V2 con imagen `dashboardma-onboarding-v2:10fc2e8` y composición base (sin override). No borrar el volumen ni cambiar el dashboard original. Los datos de clasificación permanecen aparte y no deben eliminarse para ocultar errores.

## Pendientes
Autorizar coordinador; importar fuente desde sesión autorizada; conectar catálogo con selección gobernada de la fase 2; implementar consulta de carga/capacidad y recomendaciones. Esta entrega no modifica Assigned To, equipos o tareas de Azure.
