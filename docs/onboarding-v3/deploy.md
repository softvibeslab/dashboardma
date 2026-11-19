# Docker V3 — receta histórica del candidato inicial

V3 ya está publicado de forma aislada. Esta sección histórica no es el procedimiento vigente: usar base+preview+enrichment, no solo base. Ver [supervised-enrichment.md](supervised-enrichment.md) y [continuity-release.md](continuity-release.md).

## Construir desde revisión limpia
```
git archive HEAD | tar -x -C <directorio-vacio-de-revision>
docker build -f Dockerfile.onboarding-v3 --build-arg V3_REVISION=<SHA-completo> -t dashboardma-onboarding-v3:<SHA-completo> <directorio-vacio-de-revision>
```
El Dockerfile-specific ignore es allowlist; no incluye datos, .env, pruebas, broker runtime, claves, backups ni grafos generados. Imagen no-root uid1000, raíz read-only en receta, sin herramientas del agente ni configuración de proveedor.

## Receta, no autorización
`deploy/onboarding-v3.compose.yml` exige `V3_RELEASE`, `V3_SSO_ENV_FILE`, `V3_ROLES_FILE`, `V3_PUBLIC_ORIGIN`. Archivo env privado exclusivo V3; no copiar toda la configuración runtime de V2. Solo `SESSION_SECRET` aprobado compartido permite consumir SSO existente. Contenedor y volumen dedicados, sin puertos publicados, sin etiquetas Traefik y restart=no. No se ejecutó compose up. No hay gateway/dashboard Hermes modificado.

Overlay opcional `deploy/onboarding-v3-source.override.yml`: `V3_SOURCE_DIRECTORY` privado sanitizado con `users.json` y `catalog.json`, montado read-only por directorio para observar reemplazos atómicos. Nunca montar todo el data/expediente V2. El adaptador no bloquea ni escribe en esta fuente. El listado público permanece apagado.

Antes de una publicación futura: autorización explícita, backup privado restaurable V3 y manifiestos V1/V2, confirmar roles exactos, validar fuente/proyecto y credenciales, health/image SHA, rutas/assets/hash/401/403 y flujo corporativo con usuario real. Proxy/router deliberadamente ausentes: no anunciar URL pública usable. No se autoriza inferencia sobre clientes por haber probado un fixture sintético.

## Rollback futuro
Parar únicamente V3 y retirar únicamente su router futuro; conservar volumen/historial. V1/V2 no forman parte de este servicio. No bajar ni recrear sus contenedores para instalar V3.
