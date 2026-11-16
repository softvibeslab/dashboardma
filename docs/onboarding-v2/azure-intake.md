# Etapa 1 V2: Azure intake de solo lectura y propuesta documental

## Implementado (candidato local, no publicado)

- `POST /dashboard/onboarding-v2/api/azure/import`: sesión V2 existente (SSO o revisión local explícita), RBAC editor **o** coordinator y Origin exacto. Body: `{id: <integer>, revision: <current V2 revision>, confirmReplace: <boolean>}`. No acepta URLs ni credenciales del navegador. El ID raíz debe figurar en la allowlist del servidor.
- Organización y proyecto fijos: `https://dev.azure.com/MobileappsAmerica`, `agileNestCorp`. `GET workitems/{id}?$expand=all` conserva campos completos disponibles, incluidos custom, y relaciones. Comentarios paginados en endpoint independiente. Hijos directos se leen desde el proyecto fijo; no se siguen nietos.
- Relaciones Azure pueden usar nombre o GUID del proyecto. Se valida URL/origen/organización/formato, se toma solamente el ID y se reconstruye la consulta en el proyecto aprobado. Cada respuesta work item debe coincidir con ID y `System.TeamProject`. Un hijo ilegible queda como fallo explícito, no como contenido inventado.
- Original separado en `state.azureIntakes[].snapshot`, con revisión Azure, campos/fechas originales, versiones/fechas de comentarios cuando Azure las entrega, URL/fecha de lectura y metadata de extracción. `comments.sourceRevision` es la revisión del work item asociada a esa lectura, **no** una promesa de atomicidad de los comentarios. Un hash SHA-256 liga cada snapshot a su registro.
- Propuesta documental **determinista**, sin runtime IA: copia descripción/criterios reportados, comentarios realmente leídos y texto extraído de adjuntos soportados, agrega preguntas de entorno y reproducción. No deduce causas ni reproduce defectos. Contexto acotado; el original completo permanece en snapshot. No inventa criterios de aceptación como si fueran originales.
- Se reutiliza `model.change(save, phase=1)` para historial, revisión optimista e invalidación de aprobaciones/revisiones. El registro de importación guarda versión V2, actor/fecha, `sourceHash`, `proposalHash`, `generation=documentary-deterministic-v1`, `aiStatus=not-run` y snapshot. Guardados humanos posteriores no modifican ese original.
- Reemplazar un borrador no vacío exige confirmación explícita **y** revisión vigente. Importación y guardados se serializan en la cola del servidor. Dos peticiones con la misma revisión no pueden ganar ambas. Fallo del padre Azure no crea una versión ni borra el borrador. Fallos parciales de hijos/comentarios/adjuntos se conservan con advertencias.
- UI de fase 1 mantiene CSS/diseño existente: ID/importación, aviso de no IA, fuentes originales/advertencias por versión, historial y comparación de versiones existentes. Bloquea importación con cambios locales sin guardar. Cancelar la confirmación conserva el borrador.
- Publicar en Azure está deshabilitado y etiquetado pendiente. **No hay endpoint de publicación ni código de writes Azure**. No cambian descripción, criterios ni estado.

## Límites y seguridad

| Fuente | Límite / comportamiento |
|---|---|
| Work items | Raíz allowlisted; máximo 10 hijos directos; respuesta individual 1 MiB |
| Comentarios | Hasta 10 páginas por item, `$top=100`; 1 MiB por página; token repetido/inválido falla explícitamente |
| Relaciones/archivos | Todas las relaciones quedan inventariadas en original; procesa como máximo 20 adjuntos por item |
| Extracción | Solo TXT/MD/CSV/JSON UTF-8: hasta 256 KiB y 100000 caracteres por archivo; rechaza NUL/UTF-8 inválido |
| No soportados | PDF, Office, imágenes, videos, ZIP, HTML, etc.: metadata-only, sin descarga/OCR/IA |
| Snapshot | Máximo 8 MiB serializados; excederlo aborta importación sin guardar |
| Propuesta | Contexto máximo 95000 caracteres; límite indicado en restricciones; consultar original completo |
| Red | GET exclusivamente, timeout 12 s por petición, `redirect:error`, sin reintentos ni rotación de credenciales |
| URLs | HTTPS, host exacto `dev.azure.com`, organización exacta; sin userinfo ni fragmentos; rutas WIT acotadas; queries de adjuntos se reconstruyen |
| Enlaces embebidos | Quedan en campos/comentarios originales, no se descargan; no hay crawler ni inventario semántico automático |

El error de red no propaga cuerpos Azure, URL arbitraria ni token. Datos originales se muestran escapados, nunca HTML activo. El PAT solo existe del lado servidor y no forma parte de DTOs/logs. Snapshots completos requieren el mismo acceso privado que el estado V2. El modelo sigue siendo **un borrador activo** con historial, no una bandeja multirrequerimiento.

Las lecturas de campos, comentarios y archivos son sucesivas, no una transacción Azure. No existe aún una comprobación de concurrencia contra Azure para publicación porque publicación está fuera de este incremento. Los locks son del proceso V2: no habilitar múltiples réplicas escribiendo el mismo JSON. Historial/originales son append-only por esta API; el crecimiento de almacenamiento necesita política operativa futura. Los límites son por fuente y totales de snapshot; no hay job asíncrono/cancelación ni SLA total de importación.

## Configuración para revisión y posterior deploy por el responsable

1. Construir desde este candidato tras revisión; no usar la imagen publicada anterior para afirmar que incluye intake. Dockerfile V2 ya copia `src/onboarding-v2/` completo y sus assets; no requiere paquetes nuevos.
2. Configurar archivo **privado fuera de Git**, con permisos restringidos, que contenga `V2_AZURE_PAT` (credencial autorizada de lectura WIT) y `V2_AZURE_ALLOWED_IDS` (IDs aprobados separados por comas, sin espacios). Ausencia de PAT/allowlist deja intake deshabilitado. No imprimir `docker inspect`/`compose config` con valores secretos.
3. Nuevo overlay opcional `deploy/azure-intake.override.yml`, mediante `V2_AZURE_INTAKE_ENV_FILE` apuntando al archivo privado. Mantener los cuatro compose existentes: base + classifications + public-directory + staffing, SSO/RBAC y volumen de datos. Añadir el overlay de intake como quinto archivo, no sustituir los vigentes. No reutilizar datos operativos V1 como almacenamiento V2.
4. Respaldar datos V2 de forma privada y revisar crecimiento/tiempos del piloto antes del despliegue. No se necesita migración destructiva: estados anteriores sin `azureIntakes` siguen funcionando.
5. Tras aprobación de deploy: comprobar health, hash exacto de assets, anonimato 401, Origin inválido 403, edición con sesión SSO real aprobada, origen/revisión/fuentes, unchanged V1. Las cookies SSO sintéticas de tests no prueban un login Entra humano.

**Este trabajo no instala paquetes, despliega, hace push, reinicia servicios ni modifica Azure.**

## Pendientes explícitos

- Runtime Hermes/IA seguro, ejecución trazable y revisión de consistencia IA.
- Más extractores aislados (PDF/Office/OCR), inventario de evidencia inline, jobs con presupuesto global/cancelación.
- Aprobación humana de una versión/hash exactos para publicación Azure, comprobación de revisión remota y resolución de concurrencia.
- Publicación de adjunto versionado + comentario, sin reemplazar descripción/criterios/estado, y readback exacto de ambas escrituras. Ningún consentimiento genérico sustituye la aprobación concreta de la versión.
- Incorporar originales/procedencia Azure al paquete final cuando se defina ese contrato; hoy se conservan en el estado privado V2, no se agregan silenciosamente al export existente.
- Piloto SSO humano y publicación de este candidato tras revisión del responsable.
