# Publicación secuencial segura del agente V3 — receta operativa

**Estado de esta entrega:** candidato unido; no se han instalado unidades, cambiado procesos/volúmenes/env productivos, modificado el broker vivo ni hecho nuevas llamadas pagadas. El release vivo de preguntas `5b19929fe16568ee1bb07c0a6089d62c1678e333`, ya confirmado por el coordinador, se conserva. Aunque la publicación secuencial fue autorizada condicionalmente, no se instala un agente sin el corpus y readiness real que exige esa autorización. Esta receta no es constancia de despliegue.

## Gate que impide anunciar un agente inexistente

El código ya conecta `server.js` con `native-agent-startup.js`. Sin `V3_NATIVE_AGENT_AUTHORIZED=true`, o ante fichero privado inválido, bindings vacíos, socket inaccesible, modo fixture, falta de propósito/esquema, toolset excesivo o aislamiento incompleto, se conserva el motor documental controlado existente. El log solo emite el código de selección. No cambia modelos ni perfiles Hermes.

La selección es **de arranque**: activar un mediador después requiere reiniciar solo V3 mediante el procedimiento aprobado. Si el agente ya admitió un turno y falla, se conserva el borrador y el error terminal; no se repite mediante el LLM anterior. Mantener intactos el broker LLM anterior y sus credenciales/socket hasta verificar la nueva ruta. No hay flag de navegador que seleccione motor, proveedor o fixture.

Bloqueo operativo concreto pendiente: **no se ha aprovisionado/verificado aquí un manifiesto de fuentes operativas y bindings actor/org/proyecto/expediente/sourceHash autorizados**. La autorización para publicar no convierte memorias globales o catálogos completos en fuentes compartibles. No habilitar el agente para expedientes reales hasta completar ese gate; no cambiar su etiqueta por una llamada LLM sin herramientas. Las pruebas nativas de esta rama usan corpus sintético.

## 1. Registrar un backup NUEVO inmediatamente antes de tocar producción

No reutilizar como backup vigente el release de preguntas si hubo escrituras desde entonces. Identificar mediante la evidencia del despliegue vigente los nombres/path reales; no adivinar unidades, volúmenes, PID o nombres de contenedor.

Variables que el operador debe resolver del despliegue actual: `APP_UNIT`, `APP_CONTAINER`, `STATE_FILE`, `APP_ENV_FILE`, `APP_RUNTIME_CONFIG`, `BROKER_UNIT`, `BACKUP`, `CANDIDATE`. Validar que V1/V2 y el gateway Hermes no son esos targets. Antes de ejecutar un cambio, inventariar listeners y propietario del socket nuevo (`ss -ltnp`, `ss -xlpn`); no se necesita otro puerto TCP.

En una ventana aprobada de escritor único para V3, crear un directorio privado externo a Git, `umask 077`, y capturar:

```sh
install -d -m 0700 "$BACKUP"
cp --preserve=all "$STATE_FILE" "$BACKUP/state.json"
cp --preserve=all "$APP_ENV_FILE" "$BACKUP/app.env"
cp --preserve=all "$APP_RUNTIME_CONFIG" "$BACKUP/runtime-config"
systemctl cat "$APP_UNIT" > "$BACKUP/app-unit.txt"
systemctl show "$APP_UNIT" -p MainPID -p FragmentPath -p ActiveState > "$BACKUP/app-owner.txt"
systemctl cat "$BROKER_UNIT" > "$BACKUP/existing-broker-unit.txt"
journalctl -u "$APP_UNIT" -n 200 --no-pager > "$BACKUP/app-journal.txt"
journalctl -u "$BROKER_UNIT" -n 200 --no-pager > "$BACKUP/broker-journal.txt"
docker inspect --format '{{.Image}} {{.Config.Image}} {{.State.Status}}' "$APP_CONTAINER" > "$BACKUP/image.txt"
sha256sum "$BACKUP/state.json" "$BACKUP/app.env" "$BACKUP/runtime-config" "$BACKUP/app-unit.txt" "$BACKUP/existing-broker-unit.txt" > "$BACKUP/SHA256SUMS"
```

Estos archivos pueden contener secretos o información operativa: **no imprimir su contenido, subirlos a Git ni servirlos desde la web**. Ajustar el conjunto si hay más de un archivo de configuración; no tratar un directorio como fichero. Registrar hashes de artefactos de broker/worker y SHA OCI actual, recuentos/IDs/hashes de preguntas, versiones, decisiones y asignaciones sin modificar estado. Verificar que no se concedieron reviewer/QA. La pausa/ventana de escritor y su levantamiento pertenecen al coordinador del despliegue, no a este script de pruebas.

## 2. Aprobar el corpus y generar un solo manifiesto gobernado

El mediador no lee todos los proyectos ni memorias. El manifiesto privado tiene exactamente `{grants, sources}`:

- Cada grant: `{actor, org, project, caseId, sourceHash}`. Identidad real y snapshot exacto guardado, no correo ni texto del prompt.
- Cada fuente: `{id, org, project, kind, ref, text}`. `kind` solo `repository`, `graphify` o `ecosystem`; `ref` SHA completo o fecha UTC ISO. `id` debe preservar ruta/localización de la fuente. El mediador calcula SHA256 del texto.
- Extraer solo fragmentos aprobados de los repositorios/Graphify **ya autorizados** y de la documentación común del Ecosistema. Las fuentes Azure del requerimiento siguen entrando por el snapshot existente y su selección acotada, conservando organización/proyecto/work item/versión, no mediante consultas nuevas del agente. No etiquetar un export Azure como repositorio/Graphify ficticio para superar el gate de índice; si no hay fuentes propias autorizadas, falla cerrado.
- No ingerir automáticamente el catálogo de personal/proyectos entero, conversaciones, caches, credenciales, `.env`, memorias privadas o datos ERP. Bocadeli/QueryGuard siguen fuera de las capacidades.
- Compartir contexto solo cuando sea **a la vez** `org=common`, `project=ecosystem`, `kind=ecosystem` y haya revisión explícita de clasificación. El permiso para «todos los proyectos» no evita fronteras de cliente.
- Sin una fuente propia del proyecto y su grant exacto, el mediador falla cerrado, incluso si existen fuentes comunes. Máximo 100 fuentes, 8000 caracteres/fuente, 24 KB recuperados; no se presupone cobertura total. Manifest y clave `0600`, fuera del docroot/Git. Publicar nuevas versiones solo mediante revisión, no hooks/watchers globales.

La app recibe **solo una copia de `manifest.grants` como array JSON de bindings**, no todo el corpus ni la credencial de proveedor. El handshake ahora exige SHA256 canónico idéntico de esos bindings y los grants efectivos del mediador, y cobertura válida dentro del presupuesto para **todos** los bindings, no solo un proyecto. No se publican IDs de actores ni texto en `/health`. Identificadores son literales opacos imprimibles, máximo 200 caracteres: conserva dos puntos de IDs SSO y espacios/Unicode de proyectos sin normalizarlos, derivar roles por correo ni reinterpretarlos como paths.

Un cambio de importación/hash necesita otro binding aprobado; app/mediador deben reiniciarse coordinadamente con el mismo conjunto revisado. Los textos recuperados quedan asociados a fuentes/proyecto/ref/hash y tool-call ID; no pasan a ser evidencia Azure independiente.

Validación offline real, sin inferencia/credenciales/lectura de memorias ni modificar servicios, antes de instalar:

```sh
python3 scripts/v3-native-agent-context-validate.py \
  --manifest /ruta/privada/manifest.json --bindings /ruta/privada/bindings.json
```

Exit `0` solo confirma plan privado coherente y cobertura de los grants; **no** readiness de runtime/proveedor. Exit `3` distingue plan ausente/inválido, permisos, ambigüedad, bindings distintos o proyectos sin índice/presupuesto. Solo emite hashes y recuentos, nunca textos ni actores. No crea grants RBAC ni consulta Azure/ERP. Los planes siguen requiriendo revisión humana de clasificación y minimización de cada fragmento.


## 3. Instalar artefacto separado y supervisor Unix

Después de review, crear un release inmutable desde el SHA exacto publicado y escaneado. No copiar un worktree sucio. Destino propuesto de la **receta**, no existente por esta entrega: `/opt/dashboardma-v3-native/<SHA>` con symlink `/opt/dashboardma-v3-native/current`. No reemplazar `/opt/dashboardma-v3-llm/...` ni su worker.

La plantilla versionada es `deploy/onboarding-v3-native-agent.service.example`. Antes de instalarla, verificar el GID **host-mapped** de la app; `Group=1000` solo es el valor estándar del Dockerfile Node y debe ajustarse si hay remapeo. No se trata de un grant RBAC. El supervisor es propietario de:

- Estado: `/var/lib/dashboardma-v3-native-agent`, `0700`; SQLite/lock `0600`.
- Socket compartido separado: `/run/dashboardma-v3-native-agent`, propietario supervisor + grupo de app, `0710`; `agent.sock` `0660`.
- Corpus/clave de mediador: `/etc/dashboardma-v3-native/{manifest.json,mediator.key}`, `0600`, solo supervisor.

El socket puede montarse read-only en la app; **no montar** el directorio de estado, corpus, HOME Hermes, auth del proveedor o repositorios del host. La app solo puede conectar al mediador por el socket y necesita su clave. La clave de mediador no es una clave de proveedor.

Comandos soportados por el candidato:

```sh
python3 scripts/v3-hermes-agent-probe.py --audit
python3 scripts/v3-hermes-agent-broker.py \
  --directory /var/lib/dashboardma-v3-native-agent \
  --socket-directory /run/dashboardma-v3-native-agent \
  --manifest /etc/dashboardma-v3-native/manifest.json \
  --key-file /etc/dashboardma-v3-native/mediator.key --real
```

El primer comando no solicita inferencia. El segundo inicia el servicio nativo real **pero no ejecuta modelos al arrancar**: verifica OS/dispatch y luego atiende el socket. `--real` permite únicamente el endpoint/modelo fijos ya implementados; no refresca ni escribe auth/perfiles. El supervisor necesita el runtime Git/venv Hermes fijado en la documentación y lectura de la credencial existente; si no está disponible/vigente, readiness es false. No provisionar una credencial mediante chat ni montar esa credencial en V3.

Instalar la plantilla bajo un nombre **nuevo**, por ejemplo `dashboardma-v3-native-agent.service`, después de adaptar/revisar rutas y GID; `daemon-reload/start` solo en la ventana autorizada. No se ejecutaron esos comandos en esta entrega. El `flock` impide dos propietarios del estado. SIGTERM elimina su propio socket; tras caída solo se retira un socket huérfano con conexión rechazada y lock exclusivo. La prueba aislada comprueba reinicio, socket huérfano, propietario duplicado y permisos compartidos sin exponer SQLite. No se afirma que systemd haya sido instalado/probado en producción.

## 4. Preparar V3 sin desactivar el motor existente

Construir el Dockerfile **V3** con revisión exacta:

```sh
docker build -f Dockerfile.onboarding-v3 --build-arg V3_REVISION="$CANDIDATE" -t "dashboardma-onboarding-v3:$CANDIDATE" .
```

Conservar íntegros los argumentos de despliegue, data volume, SSO, roles, origen y configuración del LLM actual. Agregar únicamente el mount del socket nuevo y archivos privados de bindings/clave de mediador (propiedad del UID de app, `0600` o `0400`). Nunca agregar claves de proveedor ni el HOME global Hermes. No abrir un puerto nuevo.

El nuevo bootstrap reconoce:

```text
V3_NATIVE_AGENT_AUTHORIZED=true
V3_NATIVE_AGENT_SOCKET=/run/native-agent/agent.sock
V3_NATIVE_AGENT_KEY_FILE=/run/v3-native/mediator.key
V3_NATIVE_AGENT_BINDINGS_FILE=/run/v3-native/bindings.json
```

Esos paths son **dentro del contenedor**, correspondientes a mounts explícitos que debe configurar el operador. No cambian `V3_HERMES_*`: esos valores conservan el broker controlado para fallback de arranque y rollback. El helper comprueba permisos, bindings no vacíos y readiness de los tres propósitos; no usa el modo fixture ni llama al modelo para elegir.

En el contexto/usuario/env de la app y con los mounts ya preparados, el diagnóstico sin inferencia es:

```sh
node scripts/v3-native-agent-readiness.mjs
```

Ese script es herramienta de operador del release; si se ejecuta dentro de una imagen que no copia `scripts/`, usar el archivo del release como mount read-only o ejecutar un probe equivalente con `nativeAgentTransport.describe()` desde el backend. No reconstruir una imagen abriendo el HOME de Hermes. Exit `0` solo significa handshake nativo real completo; exit `3` conserva el motor actual y muestra un código reducido. No demuestra inferencia de clientes. Publicar V3 solo después del backup inmediato y del gate de contexto, y verificar el log `V3 documentary engine selection: native-ready`; cualquier otro código no debe anunciarse como agente operativo.

## 5. Gates posteriores y rollback

- Comparar SHA Git/OCI, propietario PID/cgroup de la nueva unidad/socket, y hashes de artefactos/manifest/bindings. Revisar estabilidad tras el arranque; no confundir HTTP healthy del contenedor viejo con el nuevo.
- `/health` del mediador requiere clave privada y anuncia `summary/enrich/question`, esquemas documental/questions, `authorized_context` únicamente, commit Hermes fijado, aislamiento, `questionHistory=none`, `maxOriginalRefs=8`, cobertura agregada y `allProjectsIndexed=false`. No publicar ese endpoint ni la clave al navegador.
- Comprobar `/api/config` y gates privados/SSO/RBAC por las rutas existentes, sin fabricar usuarios, cookies o grants reviewer/QA. El nombre/correo autenticados y las 20 preguntas legacy del release anterior deben permanecer según la evidencia vigente, no según fixtures.
- Verificar nombre del motor, progreso durable y alternativas no aplicadas en la página. Los tool events solo deben aparecer después de una llamada real, con fuentes/proyecto/ref/hash observados. No mostrar reasoning ni porcentaje inventado. No disparar inferencia operativa para una prueba de salud.
- Ejecutar primero el audit/fixtures nativos ya reproducibles, aislados del estado productivo. Este incremento no repite el probe pagado; conserva la evidencia sintética real anterior. Si se requiere excepcionalmente otro probe de proveedor, que sea sintético/acotado, justificado y sin datos de cliente.
- Si no hay contexto/readiness real, **no desactivar el LLM actual**. Se puede publicar el código manteniendo selección controlada explícita, pero no anunciar el agente como funcionando. La publicación en página requiere además el gate de manifiesto operativo y la verificación externa del parent.

Rollback preferente: desactivar solo `V3_NATIVE_AGENT_AUTHORIZED` y reiniciar V3 con la misma configuración original; el broker LLM no se modificó. Si procede volver a la imagen/config/unidad anteriores, usar los recibos del backup nuevo. No restaurar `state.json` sobre escrituras posteriores: comprobar revisión/hash y ventana de escritor, o resolver cambios humanos antes. Nunca revertir V1/V2, modelos/perfiles/gateways Hermes o conceder roles para hacer pasar verificaciones.
