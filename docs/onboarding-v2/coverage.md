# Matriz honesta de cobertura — Onboarding V2

## Resultado ejecutado
- `npm test`: **136 tests, 136 pass, 0 fail, 0 skipped**. Log real: `/root/.hermes/cache/scratch/onboarding-v2-node-results-final.txt`.
- `npm run test:v2`: **15 tests, 15 pass, 0 fail, 0 skipped** (incluye Chromium real y consumidor SSO con cookie sintética).
- `python -m unittest discover -s test -p '*_test.py' -v`: **22 tests OK**.
- `npm run check:v2` y `npm run check`: exitosos.
- `git diff --check`: exitoso. Búsqueda dirigida de claves privadas/PAT GitHub/API keys Google en archivos nuevos de app/docs: sin coincidencias; no equivale a auditoría exhaustiva de secretos.
- Detector Impeccable en `public/onboarding-v2`: salida `[]` en la pasada visual. Las correcciones funcionales posteriores conservaron esa identidad y se revisaron capturas escritorio/móvil; no se hizo auditoría formal WCAG.

E2E final real: `/root/.hermes/cache/scratch/v2-browser-HM0Y4X/` contiene estado sintético y capturas `desktop.png`, `mobile.png`. Recorrido en prefijo `/dashboard/onboarding-v2`, 1440x1000 y 390x844, siete fases, confirmación de frente, dos revisiones autenticadas locales, tres aprobaciones, export HTTP, recepción y recarga persistente. Resultado PASS, revisión 13, paquete de prueba hash `db4bca53dd18081f6fa40e0a54017576d85681bd3d6891bda646807be07a3731`. No son datos ni aprobaciones productivos. Las capturas revisadas visualmente de la misma versión están también en `/root/.hermes/cache/scratch/v2-browser-LSbBmy/`.

## Requisito → implementación → prueba → estado
| Requisito del plan | Implementación | Evidencia | Estado / límite |
|---|---|---|---|
| Entrada independiente, solo onboarding | `src/onboarding-v2/server.js`, `public/onboarding-v2`, `npm start` | `v2-http`, `v2-browser` | Verificado local; torre original fuera de rutas V2 |
| Datos independientes y persistentes | fichero V2, cola y rename atómico | `v2-http`: lectura del archivo y escrituras concurrentes; browser reload | Verificado; un expediente y un escritor por archivo |
| Navegación siete fases, responsable/versión persistentes | rail y statusbar sticky, acciones explícitas | Chromium escritorio/móvil | Verificado; navegación de preparación libre, avance de revisiones/entrega bloqueado en servidor |
| Contexto y fuentes reales | campos y estado de fuente servidor; no extracción URL implícita | `v2.test`, `v2-integrity` | Verificado texto/referencias; carga binaria/PDF/URL/Graphify pendiente |
| Preguntas/decisiones owner y bloqueantes | IDs, owner, respuesta y motivo | `v2-integrity` | Verificado reglas; no IA |
| Versiones, diff e impacto | instantáneas por save, comparación antes/ahora por fase, epochs para no resucitar aprobación | `v2.test`, `v2-approval` | Verificado estructura y caducidad; no diff semántico IA |
| Frentes separados disciplina/área | entregable/repo/owner/reviewer/confirmación/dependencias/contrato | `v2.test`, `v2-approval`, browser | Verificado; repositorios no leídos |
| Confirmación y asignaciones | owner autenticado confirma; coordinador cambia asignaciones existentes | `v2-approval`, `v2-http` | Verificado local; alta inicial permitida a editor |
| Specs compartida y por frente / IDs / índice | secciones shared + cada frente, criterios con sección, índice anclado | `v2.test`, `v2-view`, browser | Verificado |
| Comentarios versionados | append-only vía API, actor/versión/hash | `v2-approval` | Verificado modelo; browser recorre specs, no publica comentario en E2E |
| Regeneración selectiva | no expuesta | ausencia deliberada y avisos UI | Pendiente; no se finge generador ni integridad no probada |
| Validación documental por capas | reglas deterministas + revisión autenticada independiente + hallazgos | `v2.test`, `v2-approval`, `v2-integrity`, browser | Verificado estructura/humana; consistencia IA no ejecutada |
| Hallazgos owner/severidad/resolución/excepción | hallazgo enlazado a sección, excepción motivada/aprobador | `v2-integrity` | Verificado estructura; aprobador externo es declaración revisada, no firma externa |
| Separar preparación de QA software | objeto explícito; no-software solo planned, plan y revisión | `v2.test`, browser | Verificado |
| Software build/entorno/trazabilidad/evidencia/defectos | controles servidor criterio-riesgo-caso, ejecución declarada, revisión independiente, críticos | `v2.test`, `v2-integrity` | Verificado reglas con datos sintéticos; NO se ejecutó software del usuario ni evidencia externa |
| Roles y aprobaciones por objeto/versión/hash | spec, tests, front:ID, revisor/rol y hash requerido; retorno con motivo | `v2-approval`, browser, `v2-http` | Verificado modo local |
| Caducidad y conservación de historial | hashes y epochs, revisiones invalidadas por cambios dependientes | `v2-approval` incluyendo edición/reversión | Verificado |
| Acceso no autorizado / CSRF / payload malformado | sesión, origen exacto, allowlist, roles servidor, revisión optimista | `v2-http`, `v2-approval`, `v2-sso` | Verificado rutas ensayadas; no pentest integral |
| SSO existente sin bypass público | consume `ma_ct_session` firmada, mapea tid+oid en RBAC V2, local login deshabilitado en SSO | `v2-sso` con cookie firmada sintética/expirada/malformada/usuario sin rol | Implementado y probado localmente; sesión Entra real PENDIENTE del padre |
| Prefijo para proxy sin colisión | `V2_BASE_PATH`, assets/API internos, 404 fuera, publicOrigin explícito | `v2-sso` + browser de siete fases con prefijo | Verificado localhost; proxy HTTPS real PENDIENTE |
| Entrega estructurada y receipt | JSON files+manifest+aprobaciones+límites+megaprompt; destinatario y hash | `v2-integrity`, `v2-approval`, browser | Verificado descarga/recepción; no envío automático externo |
| Integraciones existentes | código original conservado sin modificar y regresión Node/Python | suites originales dentro de 136 Node / 22 Python | Conservadas; NO conectadas a nueva entrada V2 (IA/Azure pendientes) |
| Producción, push y despliegue | Dockerfile V2 específico + guía `publication.md` | revisión estática de aislamiento, tests prefijo/SSO | No build Docker, no push, no deploy; padre decide y ejecuta |

## Incidencias encontradas y corregidas
TDD incremental observó RED antes de las implementaciones correspondientes. Se corrigieron en ejecución: duplicación de acción de revisión al añadir registros; reactivación indebida del botón export tras guardar con bloqueos; recuperación de aprobación histórica tras editar/revertir/revisar; allowlist y validación de payload malformado; navegación/requests prefijadas; y carrera de limpieza del perfil Chromium. La regresión final no tiene fallos ni skips.

## Veredicto
**Candidata funcional local, no plan/prototipo. No declarar cerrado el plan completo en producción.** Flujo humano/documental completo y controles verificables; integraciones externas V2, prueba SSO real, publicación HTTPS, regeneración selectiva y ejecución automática QA permanecen pendientes explícitos. El padre debe revisar antes de commit/push y publicación. No se modificaron producción, credenciales ni los módulos originales.
