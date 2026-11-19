# V3 — enlace seguro a la fuente Azure

## Alcance

La búsqueda por ID/título muestra el ID y título navegables con **Abrir en Azure ↗**. Seleccionar muestra **Seleccionado · no importado**, enlace y acción de importación explícita. Cancelar la confirmación conserva el expediente sin importar. Importar vincula la fuente al expediente **local V3**, nunca crea relaciones ni modifica el work item Azure.

El contexto importado mantiene el enlace visible fuera del snapshot colapsado, la revisión Azure y la versión de importación. La superficie avanzada reutiliza la misma validación para resultados, selección y fuentes históricas.

## Contrato y seguridad

- Adaptador exclusivo `src/onboarding-v3/azure-links.js`; el conector/modelo compartidos V2 quedan intactos. Organización fija `https://dev.azure.com/MobileappsAmerica`, proyecto `agileNestCorp`, ID entero positivo seguro. El servidor deriva `webUrl` canónico: `https://dev.azure.com/MobileappsAmerica/agileNestCorp/_workitems/edit/{id}`; no sigue `_links.html` ni URLs del cliente.
- El navegador solo habilita enlaces que coinciden exactamente en esquema, host, organización, proyecto e ID con el URL enviado por el servidor. Rechaza javascript, otros dominios/organizaciones/proyectos/IDs, query, fragmentos e inyección; escapa títulos. Enlaces `target="_blank" rel="noopener noreferrer"`.
- Nuevas importaciones conservan `snapshot.root.webUrl` y URLs web de hijos leídos, incluidos en el hash de fuente. La referencia documental guarda el enlace web real; revisión, actor, auditoría `azure.import`, historia y gates existentes se preservan.
- Para snapshots anteriores se deriva un mapa de presentación `azureLinks` en el DTO privado. GET no migra ni reescribe snapshots, hashes, revisiones, auditoría o datos operativos. No se requiere reimportar para ver su enlace.
- Búsqueda/importación mantienen RBAC, origen, política de proyecto y control de revisión/reemplazo. No se cambia a otro ticket, se amplían grants, aceptan propuestas, asignan reviewer/QA ni se ejecuta inferencia al importar.

## Verificación

TDD: HTTP falló por `webUrl` ausente; Chromium falló por selección pendiente ausente; la superficie avanzada falló por enlace ausente fuera de detalles. Cada slice pasó después del cambio.

`test/v3-azure-links.test.js`: contrato HTTP, 401/403, importación/reemplazo explícitos, lectura sin migración de snapshots antiguos, serialización, fuente/hash/versión/auditoría, búsqueda por título y negativos de enlaces. `test/v3-browser.test.js`: backend real con fixture **2796**, resultado/selección/enlace, cancelación, importación confirmada, respuesta/guardado/reload real con vínculo retenido, escritorio1440 y móvil390 sin overflow, preguntas y enriquecimiento sintético existente. Ninguna prueba de este incremento llama un proveedor pagado.

Capturas `evidence/azure-link-selection-desktop.png`, `azure-link-selection-mobile.png`, `azure-link-imported-mobile.png`: fixture sintético, **no** lectura real del ticket2796 ni login corporativo.

## Publicación

Solo V3, build de git archive del commit limpio, etiqueta completa y OCI revision exacta. Preservar las tres capas actuales base+preview+enrichment, configuración privada, roles, credenciales Azure, catálogo, montajes/socket/broker y flag autorizado. Backups privados restaurables data+runtime, manifest y baseline inmediato antes de recreación; leer de vuelta salud, hashes públicos exactos, APIs anónimas401 y Origin hostil403. Comparar datos V3/V2 y contenedores/start V1/V2; V1 sigue dinámico.

La publicación se acredita con el readback privado del release, no con este documento. No se importa2796 en vivo ni se modifican datos Azure por este despliegue.
