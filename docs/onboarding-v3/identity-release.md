# V3: identidad visible coherente

## Alcance

La identidad de sesión muestra nombre y correo con un formato compartido en la entrada, las siete fases avanzadas y el catálogo/revisión privada. Los selectores RBAC conservan IDs como valores, pero presentan nombre/correo. El responsable de fase y de preguntas usa la misma proyección, sin usar el ID técnico como nombre.

El servidor toma nombre/correo de la sesión firmada; si falta un dato, usa el mapping privado del usuario resuelto por `tid` + `oid`. Sin datos presenta `Nombre no disponible` / `Correo no disponible`. No deriva autenticación ni permisos del correo o de inputs del navegador. El modo local de pruebas conserva su etiqueta explícita. IDs, roles, decisiones, hashes y auditoría no cambian de significado.

`state`, `classifications`, `staffing` y `access` devuelven metadatos de presentación del actor autenticado. Los nombres de otros usuarios provienen exclusivamente del mapping del servidor. No se consulta un directorio público para autenticar.

El directorio público permanece sin cambios: solo nombre y frentes, sin correos ni identificadores; en producción se conserva su configuración efectiva. La revisión de propuestas no se aprueba ni se modifican roles, clasificaciones o datos operativos.

## Pruebas y evidencias

- RED HTTP: la sesión firmada carecía de correo en `actor`; log `red-http.log`.
- RED Chromium contra backend real: el encabezado mostraba ID en lugar de nombre/correo; `red-browser.log`. Segunda regresión RED: responsable de fase mostraba ID; `red-owner.log`.
- GREEN HTTP cubre los cuatro endpoints, fallback por mapping, denegación por identidad diferente aunque coincida correo y rechazo anónimo.
- Chromium usa exclusivamente sesión firmada sintética, secreto de fixture y backend aislado. Recorre entrada, siete fases, catálogo/revisión y móvil. Comprueba escaping del nombre, correo consistente, ausencia de ID en encabezados y responsables, y directorio público idéntico con allowlist `name/fronts`.
- Suite V3 serial: 28/28 antes del commit. Regresión Node/Python y comprobaciones finales quedan registradas en el informe privado de publicación, no inferidas de documentos anteriores.

Evidencia privada: `/root/.config/dashboardma-onboarding-v3/releases/identity-fix-evidence/`. No versionar sus backups, logs privados, sesiones o configuración. Publicación solo V3 con imagen de SHA completo, contexto `git archive`, mismas tres capas Compose, montajes/configuración/flags/broker, backup inmediato restaurable y comprobación de hashes HTTPS.

## Límites

No se ejecuta IA operativa ni escrituras Azure. Una sesión sintética no valida el SSO de una persona. La validación humana pendiente consiste en abrir la URL publicada con la sesión corporativa propia y comprobar nombre/correo en los módulos. No se generan cookies de usuarios reales ni se publica configuración privada. Si el proveedor no aporta correo y el mapping tampoco lo tiene, el aviso de correo no disponible es deliberado, no se inventa uno.

URLs: `/dashboard/onboarding-v3/`, `/dashboard/onboarding-v3/advanced`, `/dashboard/onboarding-v3/classifications#reviewSection` en `https://iamobilityappsinc.com`.
