# Publicación verificada — Etapa 2 conectada al catálogo

## Release
- Aplicación: https://iamobilityappsinc.com/dashboard/onboarding-v2
- Catálogo y consulta pública: https://iamobilityappsinc.com/dashboard/onboarding-v2/classifications
- Rama: `feature/classification-participation`.
- Commit de aplicación: `2610ad92ccabb590d9ab43dfaed2f2a3dd8983e0`.
- Imagen desplegada: `dashboardma-onboarding-v2:2610ad9`, comprobada running/healthy.
- `V2_STAFFING_REQUIRED=true` comprobado dentro del contenedor real. Se aplican las composiciones base, clasificaciones, directorio público y staffing.

## Funcionalidad implementada
- Etapa 2 obtiene frentes activos y candidatos desde el catálogo gobernado y la proyección Azure autorizada, no desde la lista de identidades RBAC como fuente de personal.
- Filtra por frente, proyecto y participación: developer para responsable y reviewer independiente. Excluye relaciones deshabilitadas, frentes inactivos e identidades/proyectos ausentes de la copia.
- Conserva entregable, repositorio, área de negocio, contrato y dependencias. Cambiar frente/proyecto limpia asignaciones sin perder otros campos.
- Guarda procedencia y revisión del catálogo en servidor; nombres/disciplinas derivados no se aceptan como evidencia aportada por el cliente. Token protege frente a cambios del catálogo y de opciones.
- Una selección no confirma responsabilidad ni concede permisos. Confirmar y revisar requiere vínculo Azure explícito en la identidad V2 y el rol correspondiente.
- Confirmaciones registran actor y fecha del servidor. Cambios de selección hacen perder vigencia a confirmaciones; cambios de ámbito/asignaciones existentes requieren coordinador.
- Opciones retiradas aparecen como no vigentes; no se reemplazan silenciosamente. Se bloquean confirmación, revisión/aprobación y exportación si el catálogo pierde vigencia.

## Pruebas reales ejecutadas
- `npm test`: 160 pruebas aprobadas, 0 fallos, 0 omitidas.
- Python: 22 pruebas OK.
- `npm run check:v2` y `npm run check`: correctos.
- Backend TDD: elegibilidad, provenance derivada, tokens, independencia, vínculo explícito, metadata no falsificable, permisos de cambio de proyecto y serialización de snapshot.
- Chromium + backend real con datos sintéticos (no interceptación de respuestas): selección de frente/proyecto/candidatos, persistencia HTTP, confirmación autenticada local, cambio de proyecto sin pérdida del entregable, recarga, retirada de un frente, estado visual no vigente y rechazo 409 del backend.
- Capturas sintéticas finales escritorio/móvil: `/root/.hermes/cache/scratch/staffing-test-0TEZuJ/`. Sin excepciones no capturadas en el recorrido; no hubo desbordamiento horizontal.
- Los tests del frontend incluyen helpers, recuperación ante catálogos vacíos y compatibilidad legacy.

## Verificación del despliegue
- Push y lectura de hash remoto coinciden con la aplicación/configuración desplegada.
- Assets app.js, classifications.js y classifications.css por HTTPS coinciden por SHA-256 con los archivos locales.
- GET anónimo a `/api/staffing`, estado, clasificaciones privadas y paquete: 401.
- POST anónimo para guardar fase 2 con Origin legítimo: 401. No se habilitaron escrituras públicas.
- Consulta pública de nombres preservada: 28 registros, únicamente name/fronts, sin correos.
- Copia de datos V2 respaldada privadamente antes de recrear solo V2. Comparación de manifiestos antes/después: coincide.
- Dashboard original conserva salud HTTP 200.

## Estado operativo real y pendientes
Se comprobó el servicio de candidatos dentro del contenedor sin modificar datos: catálogo revisión 0, cero frentes, cero candidatos y cuatro proyectos observados en la copia. El RBAC conserva cero identidades autorizadas. El sistema muestra que un coordinador debe crear frentes y clasificar personas; no se sembraron especialidades, asignaciones ni permisos ficticios.

La conexión está implementada y habilitada. Para utilizarla con personas reales hay que autorizar un coordinador y completar frentes/participaciones en el catálogo. Para que responsables/revisores seleccionados puedan confirmar/aprobar se necesita su vínculo explícito azureIdentityKey con la identidad corporativa verificada y el rol apropiado. No se infiere por correo ni por nombre. La sesión corporativa real de un usuario sigue pendiente de validación humana; los E2E usaron perfiles locales sintéticos.

No se implementaron carga/capacidad/recomendaciones, publicación de asignaciones o tareas en Azure, ni sincronización upstream automática. La lista de proyectos/usuarios es una copia, no consulta en vivo. No se declara completa la integración Azure end-to-end de todas las etapas.

## Operación y rollback
Conservar `deploy/staffing.override.yml` junto a las otras tres composiciones al recrear V2; no omitir por accidente el flag de gobernanza. La lectura de opciones no modifica catálogo ni expediente. Roles/vínculos viven fuera de Git y se leen al arrancar: recargar solamente V2 después de un cambio autorizado de configuración.

Rollback de esta release: recrear solo V2 con imagen `dashboardma-onboarding-v2:bc2b2da` y composiciones base/clasificaciones/directorio público, sin staffing. Conservar volumen y backups; no detener ni modificar el dashboard original. No borrar selecciones históricas para ocultar conflictos.
