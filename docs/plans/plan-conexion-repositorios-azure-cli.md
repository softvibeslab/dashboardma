# Plan — Conexión gobernada de repositorios Azure DevOps vía CLI

**Estado:** EJECUCIÓN INICIADA; bloqueada en autenticación Azure DevOps por PAT expirado y ausencia de sesión Entra CLI.
**Objetivo:** conectar repositorios Azure DevOps de forma verificable para consulta, clonación, actualización local e integración posterior con la Control Tower.
**Organización objetivo por defecto:** `https://dev.azure.com/MobileappsAmerica`.
**Proyecto objetivo por defecto:** `mobileApps`.

## 1. Alcance

### Incluido

- Validar acceso a Azure DevOps mediante `az` CLI sin exponer credenciales.
- Descubrir repositorios y metadatos.
- Comparar repositorios remotos con clones locales.
- Clonar solo repositorios autorizados bajo raíces canónicas.
- Actualizar referencias locales mediante `git fetch` y, cuando sea seguro, `git merge --ff-only`.
- Conectar repositorios a Graphify/Codebase Memory cuando corresponda.
- Integrar un estado read-only de repositorios en la Control Tower.
- Generar evidencia de repositorio, rama, commit, remoto y estado de sincronización.

### No incluido sin autorización adicional

- Push, commits, creación de PRs, force reset, rebase o merge remoto.
- Cambios de permisos, políticas de branch o pipelines.
- Rotación o modificación de credenciales Azure.
- Clonación masiva de todos los repositorios sin selección de cliente/proyecto.
- Exposición pública de remotes que contengan credenciales.
- Uso de PAT en argumentos de comandos, URLs, logs, chat o archivos versionados.

## 2. Fuentes y raíces locales

Raíces canónicas conocidas del VPS:

```text
/root/workspaces/android/projects
/root/workspaces/backend-services/projects
/root/workspaces/maui/projects
/root/workspaces/web/projects
```

El dashboard existente está en:

```text
/root/workspaces/mobilityapps-dashboard-control-tower
```

La Control Tower ya tiene estructuras para repositorios, responsables, alertas y sincronización read-only. La documentación actual declara pendiente la integración real con Azure DevOps Boards.

## 3. Arquitectura propuesta

```text
Azure DevOps CLI/API
        │
        ▼
Descubrimiento read-only
        │
        ├── catálogo de repositorios
        ├── estado remoto
        ├── rama/commit
        └── errores de acceso
        │
        ▼
Worker local de sincronización
        │
        ├── git fetch --all --prune
        ├── merge --ff-only opcional
        ├── clasificación de divergencias
        └── evidencia
        │
        ▼
Control Tower read-only
        │
        ├── repositorios
        ├── responsables
        ├── alertas
        └── historial de sincronización
```

Azure DevOps permanece como fuente de verdad. La Control Tower consolida y explica; no reemplaza Boards ni Git.

## 4. Fase 0 — Confirmar alcance y ownership

Antes de tocar repositorios, definir:

- organización Azure DevOps;
- proyecto o proyectos incluidos;
- clientes/áreas autorizados;
- raíces locales permitidas;
- lista inicial de repositorios;
- rama canónica por repositorio;
- responsable técnico por repositorio;
- si la misión es solo lectura, actualización local o también escritura remota;
- política para repositorios con trabajo local no comprometido;
- política de retención de clones y evidencias.

**Gate:** no iniciar clonación hasta tener proyecto, repositorios y raíz local confirmados.

## 5. Fase 1 — Preflight de CLI y autenticación

Comandos de diagnóstico que no imprimen secretos:

```bash
az version
az extension add --name azure-devops --only-show-errors
az devops configure --list
az devops project list \
  --organization https://dev.azure.com/MobileappsAmerica \
  --output table
```

Autenticación recomendada:

```bash
az devops login --organization https://dev.azure.com/MobileappsAmerica
```

La CLI debe solicitar la credencial de forma interactiva/oculta. No utilizar:

```text
--token <token>
PAT en la URL del remoto
PAT en archivos del repositorio
PAT en .env inspeccionado o compartido
```

Después validar acceso read-only con un repositorio específico:

```bash
az repos show \
  --organization https://dev.azure.com/MobileappsAmerica \
  --project mobileApps \
  --repository <repo> \
  --query '{name:name,id:id,webUrl:webUrl,defaultBranch:defaultBranch}' \
  -o json
```

**Gate de autenticación:** la salida debe confirmar el repositorio sin exponer `remoteUrl` si contiene información sensible.

## 6. Fase 2 — Inventario remoto

Obtener el catálogo sin imprimir remotes con credenciales:

```bash
az repos list \
  --organization https://dev.azure.com/MobileappsAmerica \
  --project mobileApps \
  --query '[].{name:name,id:id,webUrl:webUrl,defaultBranch:defaultBranch}' \
  -o json
```

Para cada repositorio registrar:

- nombre exacto;
- id;
- web URL token-free;
- rama por defecto;
- proyecto;
- tamaño/criticidad si se requiere;
- destino local previsto;
- existencia de clone local;
- estado de acceso.

No normalizar ni corregir nombres remotos. Los identificadores deben conservarse literalmente.

## 7. Fase 3 — Mapeo remoto-local

Para cada repositorio aprobado:

```bash
git -C <local-path> remote -v
git -C <local-path> branch --show-current
git -C <local-path> rev-parse HEAD
git -C <local-path> status --short
```

Clasificar:

- `LOCAL_MATCH`: remoto y path corresponden.
- `LOCAL_MISSING`: existe en Azure, falta clone.
- `REMOTE_MISMATCH`: el clone apunta a otro repositorio.
- `BRANCH_MISMATCH`: rama local distinta a la canónica.
- `DIRTY`: hay modificaciones locales.
- `DETACHED`: HEAD separado.
- `NO_ACCESS`: la consulta remota no pudo verificarse.

No corregir automáticamente `REMOTE_MISMATCH`, `BRANCH_MISMATCH` o `DIRTY`.

## 8. Fase 4 — Clonación segura

Solo después de verificar identidad y acceso:

```bash
git clone <remote-token-free-or-approved-auth-context> \
  /root/workspaces/<area>/projects/<repo>
```

La autenticación debe provenir del contexto aprobado de Azure CLI/Entra, no de una URL con token.

Después del clone:

```bash
git -C <local-path> remote get-url origin
 git -C <local-path> branch --show-current
 git -C <local-path> rev-parse HEAD
 git -C <local-path> status --short
```

Si el clone falla:

- clasificar `AUTH_BLOCKED`, `NETWORK_BLOCKED`, `NOT_FOUND` o `TIMEOUT`;
- eliminar solo un destino parcial vacío;
- no crear placeholders;
- dejar el repositorio como `PENDIENTE`.

## 9. Fase 5 — Sincronización local segura

Usar dos pasos explícitos:

```bash
git -C <local-path> fetch --all --prune
git -C <local-path> status --short
```

Si la rama está limpia, tiene upstream y se autorizó actualización local:

```bash
git -C <local-path> merge --ff-only @{u}
```

No ejecutar automáticamente:

```text
git reset --hard
git clean -fd
git rebase
git push --force
git checkout de otra rama
```

Clasificar el resultado:

- `FETCH_VERIFIED`;
- `UPDATED_FAST_FORWARD`;
- `CURRENT`;
- `DIRTY_PRESERVED`;
- `FF_BLOCKED`;
- `DIVERGED`;
- `AUTH_BLOCKED`;
- `NETWORK_BLOCKED`;
- `TIMEOUT`.

## 10. Fase 6 — Graphify y Codebase Memory

Para repositorios seleccionados, después de confirmar clone y commit:

- verificar si existe índice `.codebase-memory`;
- indexar solo el repositorio autorizado;
- asociar el índice con el path y commit exactos;
- registrar fecha de indexación y estado;
- no mezclar repositorios entre clientes o proyectos;
- reindexar cuando el commit cambie de forma relevante.

El índice no reemplaza la verificación contra Git. Las decisiones sobre arquitectura deben combinar grafo, archivos actuales y estado Git.

## 11. Fase 7 — Integración con Control Tower

Agregar sincronización read-only para poblar:

- `repositories`;
- `repoProfiles`;
- `repoResponsibles`;
- `repoAlerts`;
- `meta.azureSync`;
- `syncHistory`.

Cada registro debe incluir como mínimo:

```json
{
  "repositoryId": "...",
  "name": "...",
  "organization": "https://dev.azure.com/MobileappsAmerica",
  "project": "mobileApps",
  "webUrl": "https://dev.azure.com/...",
  "localPath": "/root/workspaces/...",
  "canonicalBranch": "develop",
  "currentBranch": "develop",
  "headCommit": "...",
  "status": "UP_TO_DATE",
  "lastFetchAt": "...",
  "syncMode": "read-only"
}
```

No guardar tokens ni remotes con userinfo.

## 12. Automatización posterior

Cuando la ejecución manual esté verificada, crear un job controlado:

1. lock por repositorio;
2. snapshot de estado inicial;
3. fetch bounded;
4. cálculo ahead/behind;
5. fast-forward solo en repos limpios y autorizados;
6. persistencia de evidencia;
7. alerta por auth, divergencia, suciedad o rama no esperada;
8. backup de estado antes de sincronizar;
9. historial append-only o equivalente durable.

La automatización no debe hacer push ni resolver conflictos automáticamente.

## 13. Evidencia mínima por repositorio

```text
repository-name
organization/project
web-url token-free
local-path
origin redacted
current branch
upstream branch
HEAD before
HEAD after
working-tree status
fetch result
fast-forward result
behind/ahead after fetch
Graphify/Codebase Memory status
error class if blocked
timestamp
```

Clasificar entregables como:

- **PROPUESTO:** este plan.
- **EJECUTADO:** comandos CLI/Git realmente corridos.
- **VERIFICADO:** lectura posterior confirma estado.
- **PENDIENTE:** acceso, DNS, repositorio, rama o decisión no confirmados.

## 14. Criterios de aceptación

- `AC-01`: la organización y proyecto se validan sin exponer credenciales.
- `AC-02`: cada repositorio seleccionado se identifica por nombre, id y web URL token-free.
- `AC-03`: cada clone local queda bajo la raíz autorizada.
- `AC-04`: cada remoto se verifica contra el repositorio esperado.
- `AC-05`: ningún repositorio sucio pierde cambios.
- `AC-06`: ningún repositorio divergente se fuerza o rebasea automáticamente.
- `AC-07`: el estado post-fetch se verifica desde Git real.
- `AC-08`: la Control Tower muestra estado read-only y errores clasificados.
- `AC-09`: Graphify/Codebase Memory se indexa solo después de confirmar commit y path.
- `AC-10`: la evidencia no contiene tokens, contraseñas ni URLs con credenciales.

## 15. Riesgos

- PAT caducado o contexto Azure CLI no heredado por el worker.
- Confusión entre carpeta local `ANDROID_*` y remoto `*-and`.
- Ramas canónicas distintas entre repositorios.
- Trabajo local no comprometido.
- Repositorios inexistentes, privados o movidos.
- Mezcla de clientes/proyectos en una misma raíz.
- Rate limits de Azure DevOps o clones grandes.
- Remotos con credenciales persistidas en `.git/config`.
- Indexación de repositorio equivocado en Graphify/Codebase Memory.

## 16. Próxima acción recomendada

Ejecutar primero un piloto read-only de tres repositorios autorizados, por ejemplo uno Android, uno backend y uno web:

1. validar `az repos show`;
2. capturar preestado local;
3. ejecutar `git fetch --all --prune`;
4. verificar ramas y commits;
5. no hacer push ni modificar remotos;
6. entregar evidencia;
7. solo después ampliar el lote y conectar la Control Tower.

No ejecutar todavía el piloto hasta confirmar los tres nombres exactos, sus rutas locales y la autorización del contexto Azure DevOps.
