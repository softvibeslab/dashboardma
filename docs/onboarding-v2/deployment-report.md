# Publicación verificada — Onboarding V2

Este informe complementa `coverage.md` y `publication.md`, que describen el estado previo al despliegue. No convierte los pendientes funcionales en capacidades terminadas.

## Resultado
- Aplicación publicada por HTTPS: https://iamobilityappsinc.com/dashboard/onboarding-v2
- Rama: `feature/onboarding-v2`; commit de aplicación e imagen: `10fc2e80bb4b827191c7259cda1983b7f191e3ff`.
- Imagen: `dashboardma-onboarding-v2:10fc2e8`; contenedor separado `dashboardma-onboarding-v2`, estado running/healthy comprobado.
- Solo onboarding; origen y prefijo de assets/API independientes. Datos nuevos en volumen Docker exclusivo, sin importar información productiva.
- Runtime SSO corporativo, RBAC cerrado por defecto y sin login local alternativo. Lista inicial de permisos vacía: requiere alta explícita de identidades verificadas para trabajar en el expediente.

## Ejecuciones verificadas por el agente principal
- `npm run check:v2` y `npm run check`: correctos.
- `npm test`: 137 pruebas, 137 aprobadas, cero fallos y cero omitidas; incluye E2E Chromium con datos sintéticos, no datos productivos.
- `python3 -m unittest discover -s test -p '*_test.py'`: 22 pruebas OK.
- Escaneo de archivos candidatos contra secretos conocidos y patrones comunes: sin coincidencias; no es auditoría exhaustiva.
- Build Docker específico y `docker compose up -d --build`: ejecutados realmente.
- Usuario contenedor `node`, filesystem raíz read-only, sin puertos publicados en el host, volumen de datos independiente.
- Push y lectura posterior: el hash remoto de `feature/onboarding-v2` coincide con el commit de aplicación.

## Verificación HTTPS real
- `/dashboard/onboarding-v2`: 200, título MobilityApps Onboarding V2, pantalla de acceso observada en navegador real.
- `.../api/config`: 200, modo sso y prefijo correcto.
- `.../api/state` y `.../api/access` sin sesión: 401.
- `.../app.js` y `.../styles.css`: 200; hashes de contenido idénticos a archivos locales.
- POST `.../api/login`: 403; no habilita login de revisión local.
- POST de otro Origin a `.../api/action`: 403.
- `/dashboard/api/health` original: 200; `/dashboard/requirements/onboarding` original conserva redirección a login 302.

## Acceso autorizado
La sesión de Microsoft existente es verificada por firma/expiración; el alta de roles V2 requiere una correspondencia exacta de tenant y object ID de la identidad. No se otorgan permisos por un correo suministrado por el cliente.

Después de iniciar sesión corporativa, la persona puede abrir `https://iamobilityappsinc.com/dashboard/onboarding-v2/api/access`. Devuelve únicamente su propia identidad firmada y si tiene asignación; no entrega datos del expediente ni tokens. Sin asignación, el estado del expediente sigue respondiendo 403. El operador debe verificar identidad/alcance y dar de alta los roles autorizados en la configuración privada; reiniciar solo V2 para cargarla.

## Pendientes y frontera de evidencia
- La sesión Entra real de un usuario y su recorrido autorizado por HTTPS todavía requieren verificación humana; las pruebas SSO automatizadas usan cookies sintéticas.
- IA y Azure no conectados a la nueva entrada; generación y regeneración selectiva de specs pendientes. El adaptador histórico permanece en la base de código, pero no es una integración activa en V2.
- Extracción PDF/URL y lectura de repositorios no implementadas. Evidencias externas no descargadas ni verificadas automáticamente.
- No se ejecuta QA sobre software de negocio ni se despliega software desde este onboarding.
- Esta publicación es una candidata de validación del flujo humano/documental, no cumplimiento de la totalidad de mejoras propuestas ni reemplazo de producción.

## Operación y rollback
Composición versionada: `deploy/onboarding-v2.compose.yml`. Requiere rutas privadas en `V2_SSO_ENV_FILE` y `V2_ROLES_FILE`; nunca versionar sus valores. Mantener la etiqueta `V2_RELEASE=10fc2e8` para reproducir la imagen de esta publicación.

Rollback de esta publicación: detener únicamente `dashboardma-onboarding-v2`. No borrar el volumen ni detener el dashboard original. Al desaparecer el router V2, la aplicación original conserva su ruta `/dashboard`; no interpretar su eventual redirección genérica como una V2 publicada.
