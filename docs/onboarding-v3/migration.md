# Matriz de migración V1 / V2 → V3

No hay migración de datos ejecutada ni despliegue. «Implementado» describe este candidato; no disponibilidad pública.

| Origen | Función | V3 real | Límite / pendiente |
|---|---|---|---|
| V1 | Sidebar, título y rail de siete etapas | Entrada nueva con CSS/tokens reales V1 adaptados | No copia APIs antiguas |
| V1 | Preguntas, respuestas y enriquecer | Preguntas primero, respuesta/motivo, edición manual, guardado versionado, recarga | LLM solo si broker autorizado/configurado; no agente Hermes |
| V1 | Seleccionar/reanudar requerimientos | Borrador activo persistente, importación explícita y versiones anteriores | Bandeja multi-requerimiento todavía pendiente |
| V1 | Etapas posteriores y anterior/siguiente | Rail enlaza fases avanzadas; siguiente abre tecnologías/áreas | Fases 2–7 conservan UI avanzada V2; adaptación V1 completa pendiente |
| V2 | Azure search ID/título | Conector read-only, WIQL generado en servidor, selección y confirmación ID/proyecto | Pruebas con fixture HTTP Azure; no lectura real nueva |
| V2 | Importación proyecto | `V3_AZURE_IMPORT_POLICY=project`, `V3_AZURE_ALLOWED_PROJECT=agileNestCorp` | PAT/configuración real privada pendientes; sin allowlist #3134 en receta |
| V2 | Snapshot completo y propuesta separados | azureIntakes inmutables + borrador editable + sourceHash/rev/fechas | Hijos directos ≤10; adjuntos ≤20, texto UTF8 acotado; PDF/binarios metadata-only |
| V2 | Sincronización usuarios | Fuente autorizada snapshot, fecha original visible, recarga del archivo | No es sincronización live de Azure; upstream sigue siendo responsable |
| V2 | Catálogo/frentes/participaciones | Adaptador `V3_CATALOG_SOURCE_FILE` de solo lectura, sin review/evidencia/audit, filtros privados | Configurar proyección autorizada; no se inferirán participaciones ni acceso |
| V2 | Gobierno de asignación | Stage 2 advanced con token de catálogo, independencia, confirmación humana y stale blockers | Disponibilidad/carga no implementadas |
| V2 | Versiones/diff/permisos | Modelo V2 reutilizado, invalidación de aprobaciones y comparación explícita | Esquema de paquete sigue siendo contrato V2 heredado, no se inventa migración de esquema |
| V2 candidato | Broker LLM aislado | Transporte autenticado Unix y ledger heredados configurables V3 | Ninguna inferencia nueva ni envío de clientes; receta deshabilitada |
| V2 | SSO/RBAC | Firma/expiración compartidas, tid+oid exactos, roles explícitos | No concede permisos por email/nombre/catálogo |
| V2 | Publicar Azure | Deshabilitado en contrato/gobierno | Sin writes, cambios de estado ni aprobación implícita |

## Aislamiento
`V3_DATA_FILE` y volumen `dashboardma-onboarding-v3-data` son exclusivos. La fuente de catálogo nunca recibe `act`, escrituras ni locks: se lee y proyecta. Su revisión/fecha se vincula al borrador por el modelo Staffing heredado. Una sustitución externa no es una transacción distribuida: el siguiente acceso detecta obsolescencia. El catálogo local opcional también reside solo en V3. El listado público está apagado; ninguna evidencia histórica se publica.
