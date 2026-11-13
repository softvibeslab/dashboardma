# Publicación V2 aislada — preparación para el agente padre

No se ha ejecutado build Docker, push, cambio Traefik ni despliegue. El proceso QA permanece en loopback. Estos ajustes son una propuesta operativa para el padre, que deberá verificar infraestructura/identidades reales antes de publicar.

## Contrato de ruta
- Prefijo soportado y probado: `/dashboard/onboarding-v2` (con o sin slash final).
- HTML, CSS, JS y API quedan dentro del prefijo; no existen peticiones V2 a `/api/*` ni a `/app.js` de raíz cuando se configura prefijo.
- No usar StripPrefix: el servidor resuelve su propio `V2_BASE_PATH`.
- Rutas fuera del prefijo devuelven 404 en V2.

## Configuración de contenedor separado
Usar **Dockerfile.onboarding-v2**, no el Dockerfile histórico. Tiene contexto allowlist mediante `Dockerfile.onboarding-v2.dockerignore`, no copia `data`, `.env.auth`, uploads ni el dashboard ejecutivo. Ejecuta usuario `node` y puerto interno 4191. No ha sido construido en esta tarea.

Configuración requerida al publicar:

```text
V2_AUTH_MODE=sso
V2_BASE_PATH=/dashboard/onboarding-v2
V2_PUBLIC_ORIGIN=https://iamobilityappsinc.com
V2_PORT=4191
V2_LISTEN_HOST=0.0.0.0
V2_DATA_FILE=/app/data/onboarding-v2/state.json
V2_IDENTITY_ROLES_FILE=/run/v2/roles.json
SESSION_SECRET=<inyectado desde configuración existente, nunca Git>
```

El padre puede reutilizar el `env_file` de autenticación existente sin copiarlo al repo; V2 solo consume `SESSION_SECRET`. No inicia un nuevo flujo OAuth, no requiere App Registration nuevo para consumir la cookie, y no cambia el callback original.

Montajes independientes:
- Volumen de datos V2 vacío con propietario UID del usuario node de la imagen; no montar el directorio de datos original.
- Fichero de RBAC V2 nuevo, read-only, en `/run/v2/roles.json`. Es una lista de `{id, tid, oid, roles}`. Los valores reales deben ser aprobados por el operador a partir de identidades verificadas. Roles permitidos por la app: `editor`, `coordinator`, `reviewer`, `qa`, `reader`. No se otorgan roles por email ni por el payload cliente.
- No montar archivos de claves locales de QA en el contenedor SSO. Aunque exista un token en el fichero, `/api/login` lo rechaza en modo SSO.

SSO: V2 verifica la cookie `ma_ct_session` con el verificador existente (`src/auth.js`), exige firma/expiración válidas y `tid` + `oid` presentes, después busca coincidencia exacta en RBAC V2. Sin sesión: 401 y enlace `/dashboard/auth/login?returnTo=%2Fdashboard%2Fonboarding-v2`. Con sesión válida sin rol V2: 403. Cookie malformada/expirada no produce fallback local. No crea ni renueva cookies corporativas. Logout explícito devuelve la ruta original de cierre de sesión.

## Traefik sugerido, sin aplicar
Según la información recibida del padre, usar contenedor/servicio V2 distinto en red Docker `coolify`, sin `ports` host. Router con prioridad 11000 frente al 10000 original, regla que no capture rutas parecidas:

```text
Host(`iamobilityappsinc.com`) && (Path(`/dashboard/onboarding-v2`) || PathPrefix(`/dashboard/onboarding-v2/`))
```

Servicio hacia el **puerto interno 4191**, TLS/certresolver/entrypoint de la infraestructura existente (el padre debe comprobar sus nombres, no se han inferido). No cambiar el router original `/dashboard`.

`V2_PUBLIC_ORIGIN` es obligatorio operacionalmente para HTTPS detrás del proxy: las mutaciones comparan el header Origin con ese valor exacto y no confían en X-Forwarded-Host/Proto suministrados por el cliente. Sin configurarlo, un POST HTTPS se rechazará; no desactivar el control de origen como arreglo.

## Gates antes y después de publicar
1. Revisar Git diff, secretos y contexto Docker; `npm test`, `npm run check:v2`, Python.
2. Build específico y validación de usuario/volúmenes por el padre.
3. Sin sesión: API prefijada 401; `/api/state` de raíz nunca debe enrutarse a V2; CSS/JS 200 y sin datos sensibles.
4. Con sesión de prueba real, sin asignación V2: 403. Con asignación explícita: ver identidad correcta, roles y modo `sso`. No asumir que las pruebas con cookie sintética validan Entra real.
5. Comprobar POST con Origin HTTPS legítimo, bloqueo de otro Origin, bloqueo de autoprobación y permisos por objeto.
6. Confirmar que `/dashboard` y sus assets/API siguen respondiendo por servicio original; no editar datos de producción para comprobarlo.
7. Datos V2 inicialmente vacíos; recorrido con material claramente sintético y eliminación deliberada posterior. No importar/sincronizar información productiva automáticamente.
8. Mantener pendientes reales de IA/Azure/regeneración selectiva y QA software externa visibles. Publicar no los convierte en integraciones ejecutadas.
