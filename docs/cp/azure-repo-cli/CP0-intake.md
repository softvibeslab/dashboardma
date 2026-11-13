# CP0 — Intake: Conexión gobernada de repositorios Azure vía CLI

**Estado:** GENERADO / PENDIENTE DE APROBACIÓN HUMANA
**Iniciativa:** `INI-AZURE-REPO-CLI-001`
**Fecha de preparación:** 2026-11-03
**Fuente:** solicitud de Roger: conectar repositorios Azure DevOps vía CLI y mantenerlos actualizados.
**Artefacto base:** `docs/plans/plan-conexion-repositorios-azure-cli.md`

## 1. Objetivo inicial

Establecer un proceso seguro y verificable para descubrir repositorios de Azure DevOps, asociarlos con clones locales autorizados, actualizar sus referencias mediante CLI/Git y reportar el estado en la Control Tower, sin perder cambios locales ni ejecutar escrituras remotas no autorizadas.

## 2. Problema observado

La ejecución de preflight realizada en el VPS confirmó:

- Azure CLI instalado: `2.87.0`.
- Proyecto objetivo previsto: `mobileApps`.
- Consulta read-only a Azure DevOps bloqueada por un PAT expirado.
- No existe una sesión Entra activa en Azure CLI.
- Hay clones locales en Android, Backend y Web, pero su correspondencia remota no se ha validado en esta ejecución.

**Evidencia:** salida real de `az devops project list` con `Access Denied: The Personal Access Token used has expired` y `az account show` solicitando `az login`.

## 3. Usuarios y áreas

- Roger / responsable de la misión: decisión de alcance y autorización.
- Desarrollo/DevOps: operación CLI, Git y sincronización.
- Owners de repositorio: validación de rama canónica y cambios locales.
- QA/Control Tower: consulta de estado y evidencia.
- Seguridad: credenciales, permisos y exposición de remotes.

## 4. Alcance inicial propuesto

### Incluido

- Organización: `https://dev.azure.com/MobileappsAmerica`.
- Proyecto: `mobileApps`.
- Descubrimiento read-only.
- Piloto de tres repositorios autorizados: Android, Backend y Web.
- `git fetch --all --prune`.
- `git merge --ff-only` solo en repositorios limpios, con upstream y autorización de actualización local.
- Reporte de estado y evidencia.

### Excluido

- `push`, creación de PR o cambios en Azure Boards.
- `reset --hard`, `clean -fd`, rebase o resolución automática de conflictos.
- Clonación masiva antes del piloto.
- Exposición pública de Azure DevOps, remotes o credenciales.
- Modificación de permisos o políticas de branch.

## 5. Datos de entrada requeridos

- Confirmación de organización y proyecto.
- Autenticación Entra o Azure DevOps válida.
- Tres repositorios exactos para el piloto.
- Ruta local autorizada por repositorio.
- Rama canónica por repositorio.
- Política para repositorios con cambios locales.
- Autorización explícita: solo lectura, actualización local o escritura remota.

## 6. Preguntas CP0

1. ¿El alcance inicial es solo el proyecto `mobileApps`?
2. ¿Qué tres repositorios deben formar el piloto?
3. ¿La rama canónica es `main`, `develop` u otra por repositorio?
4. ¿Se autoriza únicamente actualizar clones locales?
5. ¿Qué owner debe recibir alertas por repositorio?
6. ¿La sincronización debe ejecutarse cada hora, diariamente o bajo demanda?
7. ¿La Control Tower debe mostrar solo estado read-only o también crear incidencias internas?

## 7. Dependencias y riesgos

- Dependencia bloqueante: autenticación Azure DevOps vigente.
- Riesgo: mezclar repositorios de clientes o áreas distintas.
- Riesgo: sobrescribir cambios locales si se fuerza una actualización.
- Riesgo: remotes HTTPS con credenciales persistidas.
- Riesgo: ramas canónicas no uniformes.
- Riesgo: rate limit o repositorios grandes.

## 8. Criterios de salida CP0

CP0 puede pasar a CP1 formalmente cuando:

- organización/proyecto estén confirmados;
- exista acceso read-only verificable;
- los tres repositorios piloto estén identificados;
- las rutas y ramas estén aprobadas;
- el límite entre actualización local y escritura remota esté explícito;
- exista un owner operativo.

## 9. Decisión requerida

**Solicitar aprobación de Roger** para cerrar el intake y continuar con CP1, manteniendo el piloto read-only y sin cambios remotos.

**Resultado:** CP0 GENERADO; no aprobado automáticamente.
