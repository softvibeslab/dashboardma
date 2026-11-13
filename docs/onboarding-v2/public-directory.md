# Consulta pública de usuarios sincronizados — publicada

## Decisión y límites
El usuario autorizó expresamente que el listado se vea sin iniciar sesión. Se publica únicamente nombre y nombres de frentes activos asociados a participaciones habilitadas. No se publican correos, IDs Azure/tenant, proyectos, roles RBAC, observaciones, historial, capacidad ni carga de trabajo. Si el nombre de origen es un correo o un identificador, se omite ese dato y se muestra `Nombre no disponible`.

Cualquier persona con la URL puede consultar o copiar los nombres publicados. Las indicaciones noindex/nofollow y cache-control no son controles de acceso ni garantizan que no existan copias.

## Release y rutas verificadas
- Pantalla: https://iamobilityappsinc.com/dashboard/onboarding-v2/classifications
- API de consulta pública: `/dashboard/onboarding-v2/api/directory`, GET exclusivamente.
- Release de aplicación: `bc2b2da17ca67ff06e8f22f0ce7d886bf0aae631`; imagen `dashboardma-onboarding-v2:bc2b2da`.
- Rama remota: `feature/classification-participation`, push y lectura del hash confirmados.
- Se configura con `V2_PUBLIC_DIRECTORY=true`; por defecto está deshabilitada en el servidor. Aplicar `deploy/public-directory.override.yml` junto a las composiciones base y de fuente sanitizada para reproducir esta publicación.

## Comportamiento
La consulta lee la proyección sanitizada de usuarios sin exigir sesión ni importar/modificar registros del catálogo. Muestra todos los usuarios de la copia de origen, aunque no tengan participación y aunque el visitante no tenga roles V2. Los no clasificados se identifican explícitamente. Búsqueda por nombre y filtro por frente o sin clasificar.

La fuente sigue siendo una copia, no una llamada Azure en vivo. El botón Actualizar listado vuelve a leer esa proyección; no ejecuta sincronización upstream. Para refrescarla se debe actualizar la copia Azure autorizada y regenerar la proyección mediante el exportador existente.

La sección administrativa y sus APIs mantienen SSO y RBAC. Ninguna consulta pública otorga permisos de coordinador ni habilita modificaciones o aprobaciones. Los errores del endpoint público son genéricos y no incluyen fragmentos de archivos privados.

## Evidencia ejecutada
- 145 pruebas Node aprobadas, cero fallos/omitidas; incluye dos nuevas pruebas de consulta pública. 22 pruebas Python OK.
- Chromium con perfil sintético limpio: listado sin login/cookies, filtros por nombre/frente/sin clasificar, administración oculta y layouts escritorio/móvil. Capturas sintéticas finales en `/root/.hermes/cache/scratch/public-directory-browser-4RfHcl/`.
- HTTPS sin cookie jar: GET público 200, 28 registros, solo campos `name` y `fronts`, sin correos. Coincide con la cantidad de la fuente privada sanitizada.
- Navegador real contra URL publicada: sección pública visible, 28 filas y administración oculta. Solicitud con credentials omit devuelve 200 y los dos campos permitidos.
- Fecha de origen mostrada: `2026-11-13T22:56:17.104Z`.
- GET a estado, clasificaciones privadas, acceso y paquete sin sesión: 401. POST anónimo al catálogo con Origin legítimo: 401. POST a la consulta pública no permite escritura.
- Assets JS/CSS públicos coinciden por hash con el código local; contenedor healthy.
- Backup privado previo y comparación de manifiestos después: datos V2 preservados. Dashboard original mantiene salud 200.

## Operación
Conservar las tres composiciones: base, `classifications.override.yml` y `public-directory.override.yml`. No eliminar controles SSO/RBAC del resto de APIs. Para retirar la consulta pública, deshabilitar `V2_PUBLIC_DIRECTORY` y recrear solo V2; esto no borra copias que terceros hayan obtenido mientras fue pública. Mantener el volumen y no cambiar el dashboard original.
