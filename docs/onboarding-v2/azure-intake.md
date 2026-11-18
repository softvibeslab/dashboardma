# Etapa 1 V2: Azure intake de solo lectura y propuesta documental

## Contrato implementado (verificación de publicación en informe privado de release)

- `POST /dashboard/onboarding-v2/api/azure/import`: sesión V2 existente (SSO o revisión local explícita), RBAC editor **o** coordinator y Origin exacto. Body: `{id: <integer>, revision: <current V2 revision>, confirmReplace: <boolean>}`. No acepta URLs ni credenciales del navegador. La política explícita del servidor autoriza por proyecto fijo o, alternativamente, por allowlist de IDs; nunca amplía proyectos/organizaciones.
- Organización y proyecto fijos: `https://dev.azure.com/MobileappsAmerica`, `agileNestCorp`. `GET workitems/{id}?$expand=all` conserva campos completos disponibles, incluidos custom, y relaciones. Comentarios paginados en endpoint independiente. Hijos directos se leen desde el proyecto fijo; no se siguen nietos.
- Relaciones Azure pueden usar nombre o GUID del proyecto. Se valida URL/origen/organización/formato, se toma solamente el ID y se reconstruye la consulta en el proyecto aprobado. Cada respuesta work item debe coincidir con ID y `System.TeamProject`. Un hijo ilegible queda como fallo explícito, no como contenido inventado.
- Original separado en `state.azureIntakes[].snapshot`, con revisión Azure, campos/fechas originales, versiones/fechas de comentarios cuando Azure las entrega, URL/fecha de lectura y metadata de extracción. `comments.sourceRevision` es la revisión del work item asociada a esa lectura, **no** una promesa de atomicidad de los comentarios. Un hash SHA-256 liga cada snapshot a su registro.
- Propuesta documental **determinista**, sin runtime IA: copia descripción/criterios reportados, comentarios realmente leídos y texto extraído de adjuntos soportados, agrega preguntas de entorno y reproducción. No deduce causas ni reproduce defectos. Contexto acotado; el original completo permanece en snapshot. No inventa criterios de aceptación como si fueran originales.
- Se reutiliza `model.change(save, phase=1)` para historial, revisión optimista e invalidación de aprobaciones/revisiones. El registro de importación guarda versión V2, actor/fecha, `sourceHash`, `proposalHash`, `generation=documentary-deterministic-v1`, `aiStatus=not-run` y snapshot. Guardados humanos posteriores no modifican ese original.
- Reemplazar un borrador no vacío exige confirmación explícita **y** revisión vigente. Importación y guardados se serializan en la cola del servidor. Dos peticiones con la misma revisión no pueden ganar ambas. Fallo del padre Azure no crea una versión ni borra el borrador. Fallos parciales de hijos/comentarios/adjuntos se conservan con advertencias.
- UI: buscar por ID o título → seleccionar resultado → confirmar exactamente ID/proyecto → importar → editar y enriquecer manualmente el borrador → guardar versión, sin reintroducir ID. `importAllowed` usa la política real. Entrada directa compatible y validada en servidor. Confirmación también en primera importación; reemplazar exige además revisión vigente y `confirmReplace`. Bloquea cambios locales sin guardar; cancelar no escribe. El original, fuentes, advertencias, historial y comparación se conservan. No presenta inferencia Hermes como activa.
- Publicar en Azure está deshabilitado y etiquetado pendiente. **No hay endpoint de publicación ni código de writes Azure**. No cambian descripción, criterios ni estado.

## Límites y seguridad

| Fuente | Límite / comportamiento |
|---|---|
| Work items | Raíz autorizada por política; cada lectura verifica `System.TeamProject`; máximo 10 hijos directos; respuesta individual 1 MiB |
| Comentarios | Hasta 10 páginas por item, `$top=100`; 1 MiB por página; token repetido/inválido falla explícitamente |
| Relaciones/archivos | Todas las relaciones quedan inventariadas en original; procesa como máximo 20 adjuntos por item |
| Extracción | Solo TXT/MD/CSV/JSON UTF-8: hasta 256 KiB y 100000 caracteres por archivo; rechaza NUL/UTF-8 inválido |
| No soportados | PDF, Office, imágenes, videos, ZIP, HTML, etc.: metadata-only, sin descarga/OCR/IA |
| Snapshot | Máximo 8 MiB serializados; excederlo aborta importación sin guardar |
| Propuesta | Contexto máximo 95000 caracteres; límite indicado en restricciones; consultar original completo |
| Red | GET, más POST al WIQL fijo generado en servidor solo para búsqueda de lectura; timeout 12 s por petición, `redirect:error`, sin reintentos ni rotación de credenciales |
| URLs | HTTPS, host exacto `dev.azure.com`, organización exacta; sin userinfo ni fragmentos; rutas WIT acotadas; queries de adjuntos se reconstruyen |
| Enlaces embebidos | Quedan en campos/comentarios originales, no se descargan; no hay crawler ni inventario semántico automático |

El error de red no propaga cuerpos Azure, URL arbitraria ni token. Datos originales se muestran escapados, nunca HTML activo. El PAT solo existe del lado servidor y no forma parte de DTOs/logs. Snapshots completos requieren el mismo acceso privado que el estado V2. El modelo sigue siendo **un borrador activo** con historial, no una bandeja multirrequerimiento.

Las lecturas de campos, comentarios y archivos son sucesivas, no una transacción Azure. No existe aún una comprobación de concurrencia contra Azure para publicación porque publicación está fuera de este incremento. Los locks son del proceso V2: no habilitar múltiples réplicas escribiendo el mismo JSON. Historial/originales son append-only por esta API; el crecimiento de almacenamiento necesita política operativa futura. Los límites son por fuente y totales de snapshot; no hay job asíncrono/cancelación ni SLA total de importación.

## Configuración y despliegue autorizado

1. Construir desde este candidato tras revisión; no usar la imagen publicada anterior para afirmar que incluye intake. Dockerfile V2 ya copia `src/onboarding-v2/` completo y sus assets; no requiere paquetes nuevos.
2. Archivo **privado fuera de Git**, 0600, con `V2_AZURE_PAT`. Política de proyecto autorizada: `V2_AZURE_IMPORT_POLICY=project` y `V2_AZURE_ALLOWED_PROJECT=agileNestCorp` exactos. Permite cualquier ID que Azure realmente devuelva dentro de ese proyecto, solo para editor/coordinator. Organización/proyecto del conector siguen fijos. No soporta wildcard ni otros proyectos. Política alternativa `V2_AZURE_IMPORT_POLICY=ids` con `V2_AZURE_ALLOWED_IDS` (enteros positivos separados por coma). Omitir la política conserva compatibilidad con allowlist existente; sin PAT o política utilizable falla cerrado. Valor desconocido o proyecto ausente/incorrecto en modo project deshabilita intake, sin fallback a IDs. La allowlist puede mantenerse para rollback; en modo project no restringe raíces. No imprimir entornos secretos.
3. `deploy/azure-intake.override.yml` usa `V2_AZURE_INTAKE_ENV_FILE`. Mantener **seis capas**: base + classifications + public-directory + staffing + azure-intake + classification-review, SSO/RBAC, flags, montajes RO y volumen; no sustituir las vigentes. No reutilizar datos V1.
4. Respaldar datos V2 de forma privada y revisar crecimiento/tiempos del piloto antes del despliegue. No se necesita migración destructiva: estados anteriores sin `azureIntakes` siguen funcionando.
5. Tras aprobación de deploy: comprobar health, hash exacto de assets, anonimato 401, Origin inválido 403, edición con sesión SSO real aprobada, origen/revisión/fuentes, unchanged V1. Las cookies SSO sintéticas de tests no prueban un login Entra humano.

La autorización de este incremento incluye despliegue exclusivamente V2, no push, publicaciones Azure, cambios de personal/participaciones o roles. El informe privado registra SHA, imagen, pruebas y readbacks; este documento define el contrato, no sustituye la evidencia de ejecución.

## Pendientes explícitos

- Runtime Hermes/IA seguro, ejecución trazable y revisión de consistencia IA.
- Más extractores aislados (PDF/Office/OCR), inventario de evidencia inline, jobs con presupuesto global/cancelación.
- Aprobación humana de una versión/hash exactos para publicación Azure, comprobación de revisión remota y resolución de concurrencia.
- Publicación de adjunto versionado + comentario, sin reemplazar descripción/criterios/estado, y readback exacto de ambas escrituras. Ningún consentimiento genérico sustituye la aprobación concreta de la versión.
- Incorporar originales/procedencia Azure al paquete final cuando se defina ese contrato; hoy se conservan en el estado privado V2, no se agregan silenciosamente al export existente.
- Piloto SSO humano: las pruebas sintéticas de browser/backend y el smoke real de solo lectura del conector no prueban login Entra ni una importación humana real.
