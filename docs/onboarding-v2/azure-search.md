# Búsqueda Azure en fase 1

La fase 1 ofrecía únicamente importación por ID. Ahora incluye búsqueda privada `GET /api/azure/search?q=...`, para editor/coordinator con sesión válida y asignación RBAC. No hay acceso anónimo ni login alternativo en producción.

- ID positivo o fragmento de título (2–120 caracteres; ID de un dígito válido). El navegador no envía WIQL, organización, proyecto ni URL.
- Organización MobileappsAmerica y proyecto agileNestCorp fijos del conector. WIQL generado y escapado en servidor; `POST` únicamente a WIQL (consulta de solo lectura), seguido de GET de metadatos. No hay escrituras Azure.
- Máximo 20 resultados, 1 MiB por respuesta y 12 segundos por solicitud; sin paginación automática. DTO: ID, título, tipo, estado, proyecto y autorización de importación. El límite puede requerir precisar la consulta.
- Buscar no importa ni modifica el expediente. Seleccionar copia explícitamente el ID; el botón de importación conserva revisión actual, confirmación de reemplazo, historial y propuesta documental existente.
- La allowlist de raíces autorizadas **no se amplía**: un resultado fuera de ella es visible pero no seleccionable para intake; el servidor sigue rechazando su importación. Se requiere revisión administrativa aparte.
- El PAT y roles permanecen fuera del repositorio. Errores remotos son genéricos, títulos escapados, proyecto de cada resultado validado. No se devuelven descripciones, identidades ni credenciales.

## Tecnologías y áreas (fase 2)

El buscador general filtra los frentes ya presentes en el borrador por tecnología/disciplina, área de negocio o entregable. En modo gobernado también utiliza el nombre del frente seleccionado del catálogo. Los selectores del catálogo de frentes, responsable candidato y revisor candidato tienen filtros propios por nombre. Se ignoran mayúsculas y acentos, hay mensajes de coincidencias/sin resultados y botón de limpiar. No existe un catálogo independiente de áreas de negocio en el modelo actual: el área sigue siendo texto libre, no se inventa ni sustituye un catálogo.

Solo se filtran opciones ya autorizadas por frente/proyecto/función y separación de revisor. Los valores actualmente seleccionados, incluso no vigentes, permanecen visibles en sus selectores aunque no coincidan. Filtrar/limpiar no modifica el borrador ni guarda; el filtro de frentes oculta visualmente tarjetas no coincidentes, sin eliminarlas ni cambiar sus campos, y limpiar las restaura. Los filtros se reinician al reconstruir la vista (guardar/cambiar contexto/recargar).

Verificación: tests unitarios del conector, HTTP con servidor real y fixtures, Chromium contra backend real con datos exclusivamente sintéticos (buscar→seleccionar→importar→versionar, escritorio/móvil). Esto no representa un inicio de sesión corporativo real. El smoke operativo solo consulta Azure y emite contadores, nunca importa en estado vivo.

Desplegar conservando las seis capas Compose actuales y el volumen/montajes privados. Fijar imagen al SHA completo y etiqueta OCI revision. Respaldar datos y configuración privada; comparar manifiestos antes/después y hashes de assets públicos. No publicar respaldos ni logs privados.
