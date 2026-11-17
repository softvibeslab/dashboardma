# Bandeja privada de propuestas de clasificación · Etapa 2

Estado: **candidato para revisión, no desplegado ni importado al runtime**. No cambia Azure, RBAC, vínculos de identidad ni el expediente. Usa el catálogo existente, no otra taxonomía.

## Flujo del coordinador

1. Iniciar sesión corporativa con una identidad ya autorizada en V2. Desde Etapa 2 abrir **Revisar propuestas privadas**, o Clasificaciones → **Propuestas privadas · Etapa 2** (`/dashboard/onboarding-v2/classifications#reviewSection`). Los demás usuarios V2 autorizados pueden consultar; solo `coordinator` puede importar o decidir. El modo local existente es únicamente para pruebas, no prueba login Entra.
2. **Importar lote privado del servidor** lee exclusivamente dos nombres fijos en el directorio privado configurado: `classification-proposals.json` y `evidence.json`. El navegador no envía fuentes, identidades, evidencia, hashes de origen ni rutas de investigación. Importar y consultar nunca crean participaciones.
3. Filtrar por persona de la copia V2, frente propuesto, confianza, estado y lote/periodo. Abrir referencias para leer fundamento, fechas/procedencia, límites e historial. La investigación histórica no demuestra productividad, disponibilidad, especialidad certificada ni permisos sobre proyectos.
4. Revisar una propuesta exacta. **Aceptar** conserva el nombre de frente propuesto; **Corregir** exige elegir explícitamente un frente actual activo. En ambos casos seleccionar frente, principal/secundario, developer/reviewer/support, proyectos de la copia actual y habilitar/no habilitar. No se preselecciona ninguno. El motivo es obligatorio. **Rechazar** solo registra una decisión y motivo: no crea participación.
5. Guardar. La respuesta contiene el catálogo aplicado; la interfaz lo vuelve a representar. Una participación habilitada pasa a ser candidata de staffing para su frente/proyecto/función; no asigna por sí misma responsable ni revisor en el expediente. No concede permisos ni capacidad libre. Se conservan las reglas de un principal por persona y unicidad persona/frente.
6. Ante 409 conservar los campos, recargar y revisar de nuevo. No reintentar silenciosamente con una revisión nueva. Una propuesta ya decidida no admite replay ni reescritura. Si ya existe participación persona/frente, la decisión falla sin modificar nada; revisar la participación por el flujo existente, no sobrescribirla implícitamente.

Confianza baja/insuficiente, referencias faltantes, identidad ausente o proyectos ausentes no pueden confirmarse desde esta bandeja. Pueden permanecer pendientes o rechazarse con motivo. La ausencia de una copia reciente no es una baja laboral. No se infieren links, roles ni proyectos a partir de nombres, correos, actividad o evidencia.

## Fuente y DTO privado

Contrato real: `schemaVersion: 1`, `mode: read-only-private-research`, `window.start/end`, `users[].azureIdentityKey`, `proposedFronts[].{front,confidence,reason,evidenceIds}`, `insufficientExplanation`; `evidence.json` es un objeto por ID de referencia. Se aceptan `alta`, `media`, `baja`, `insuficiente` (solo alta/media son confirmables). Un usuario sin frentes genera una fila insuficiente. No se importan nombres de investigación: los nombres vienen de la copia autorizada V2.

Allowlist persistida por propuesta: ID determinista, hash del lote, identidad Azure exacta, nombre del frente propuesto, confianza, fundamento acotado a 2000 caracteres, ventana, límites fijos, estado e historial. Referencias: `id`, `available`, `type`, fecha y su campo original (`date`, `changedDate` o `createdDate`), `caveat` acotado y booleanos `withinWindow`, `merge`, `initialImport`, `historyPartial`, `pathListPartial`. Se descartan títulos, comentarios/código/extractos, paths, URLs, autores/correos de evidencia, revisores, datos de identidad, raw, secretos y campos desconocidos. El operador debe verificar que los campos curatoriales reason/caveat no contengan secretos; no hay un clasificador semántico universal de secretos. Todo texto dinámico se escapa en HTML y la CSP existente sigue activa.

Lote: SHA-256 de los bytes UTF-8 de propuestas + salto de línea + evidencia; hashes individuales y fecha de corte retenidos. ID de propuesta: SHA-256 del JSON `[batchHash,userId,frontName]`. Una fuente idéntica es un no-op con el mismo catálogo/revisión/historial. Una fuente diferente agrega lote y versiones separadas; nunca borra decisiones previas. Un cambio meramente de formato también constituye otro lote. No hay deduplicación heurística por correo, nombre o frente.

La fuente completa nunca se copia a Git ni al contexto Docker. La allowlist de Docker excluye además estos nombres incluso bajo árboles permitidos. `.gitignore` bloquea copias accidentales. El catálogo y respaldos resultantes también son privados.

## Configuración propuesta (no aplicada)

Mantener las cinco capas actuales y agregar como sexta:

```text
deploy/onboarding-v2.compose.yml
deploy/classifications.override.yml
deploy/public-directory.override.yml
deploy/staffing.override.yml
deploy/azure-intake.override.yml
deploy/classification-review.override.yml
```

Nuevas variables exactas:

```text
V2_CLASSIFICATION_RESEARCH_HOST=/ABSOLUTE/PRIVATE/classification-research
# Dentro del servicio, establecida por el override:
V2_CLASSIFICATION_RESEARCH_DIRECTORY=/run/v2/classification-research
```

El bind es de directorio, read-only y `create_host_path: false`. No montar la carpeta operacional completa ni usar el repositorio como HOST. Preparar fuera del repositorio una copia privada de **solo** los dos archivos de entrada. Verificar hashes contra el lote investigado; directorio 0750, archivos 0640, propietario root y grupo correspondiente al usuario node del contenedor (verificar su GID, no asumirlo). No volver legibles globalmente los originales. No hay que modificar los cinco coordinadores autorizados, la copia Azure, las variables SSO/intake ni el volumen.

Conservar `V2_AUTH_MODE=sso`, `V2_PUBLIC_ORIGIN=https://iamobilityappsinc.com`, `V2_STAFFING_REQUIRED=true`, `V2_PUBLIC_DIRECTORY=true`, `V2_AZURE_DIRECTORY_FILE=/run/v2/azure/azure-directory.json`, RBAC y volúmenes actuales. La base mantiene `V2_DATA_FILE=/app/data/onboarding-v2/state.json`; el catálogo por defecto está en el mismo directorio, `classifications.json`.

Tras revisión/aprobación separada de publicación: respaldo privado y manifiesto de archivos, imagen del commit exacto, montaje legible como node, comprobación de flags/activos/hashes y health. Después un coordinador real hace la importación y revisión desde UI; no generar cookies de personas reales ni usar un actor de mantenimiento para simular aprobación humana. Este incremento no ejecuta esos pasos.

## Transacción y recuperación

Propuestas, decisiones, participaciones y auditoría están en **el mismo JSON de catálogo**. La validación reutiliza la rama existente de participación; solo después de validar todo se escribe un temporal 0600 y se hace un único rename al catálogo. Un fallo antes de rename deja el catálogo anterior; después de rename la decisión y participación están ambas presentes. No es una transacción con Azure, RBAC, archivo del expediente o recambio externo de la proyección. No se ofrece durabilidad de fsync frente a pérdida eléctrica ni una bitácora externa inmutable.

Todas las instancias del store para el mismo path absoluto comparten cola. `withSnapshot` y cada escritura toman además `classifications.json.lock` con creación exclusiva, evitando escritores cooperantes de otro proceso. Contención externa devuelve 503, revisión obsoleta 409. Una copia Azure se vuelve a leer al confirmar; fecha debe coincidir con la importada y cada proyecto/identidad existir tanto en catálogo como en la copia actual. Un recambio externo posterior a esa comprobación no es ACID; staffing vuelve a validar contra su copia actual. Mantener un único servicio escritor, sin aliases/symlinks al archivo ni editores externos.

Si un proceso muere, el lock queda intencionalmente bloqueante, sin vencimiento/autoborrado inseguro:

1. En una ventana de mantenimiento aprobada, detener **todos** los escritores de ese catálogo y confirmar que ninguno sigue activo. Este candidato no detiene servicios.
2. Respaldar privadamente catálogo, lock y temporales `.pending`. Leer el catálogo completo y comprobar JSON, revisión, auditoría y presencia conjunta decisión/participación por `participationId`.
3. El archivo destino es la autoridad. Nunca promover un `.pending` ni repetir una aceptación automáticamente. Si rename no ocurrió, sigue pendiente; si ocurrió, conserva la decisión y rechaza replay.
4. Retirar únicamente el lock huérfano tras esa verificación, reiniciar el único escritor y recargar por sesión autorizada. Los temporales no referenciados pueden archivarse/eliminarse después del respaldo.

Las pruebas cubren lock bloqueante/recuperación, instancias compartidas, carrera aceptar/rechazar, revisión/replay y persistencia tras abrir otro store. No se promete recuperación automática ni coordinaciones distribuidas de múltiples hosts.

## Privacidad pública

`GET /api/directory` permanece opt-in y devuelve exclusivamente nombre y frentes de participaciones habilitadas. Nunca incluye propuestas, confianza, fundamentos, rechazos, referencias, historial, proyectos o IDs. El shell HTML y JS pueden ser públicos; los datos nuevos solo llegan por `/api/classifications` con sesión autorizada. No-store, Origin exacto y CSP complementan autenticación/RBAC, no la sustituyen. Errores inesperados del catálogo son genéricos para no filtrar fragmentos privados.

## Verificación reproducible

```sh
node --test test/v2-classification-review*.test.js
npm run check
npm run check:v2
npm test
python3 -m unittest discover -s test -p '*_test.py'
git diff --check
```

El navegador usa Chromium real y backend V2 real con fixtures exclusivamente sintéticas, sin interceptar respuestas. Importa, filtra, acepta/corrige/rechaza, comprueba no autoselecciones, XSS, historial, persistencia, exclusión de participaciones no habilitadas, candidato visible en Etapa 2, DTO público y viewports desktop/móvil. Los tests SSO usan tenant/oid/secret inventados; no prueban un login corporativo real. Los tests HTTP nuevos usan sockets Unix; la prueba de navegador abre solo un listener efímero local y lo cierra.

La comprobación separada con investigación real se realiza únicamente sobre una copia temporal privada del catálogo, nunca el volumen runtime. El informe privado de revisión contiene rutas, hashes, contadores y resultados concretos. Publicar estos datos operacionales requiere autorización distinta de publicar el código sintético.
