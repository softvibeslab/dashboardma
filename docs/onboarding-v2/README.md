# Onboarding V2 — guía local

## Alcance probado
Aplicación Node sin dependencias npm, UI corporativa blanca/azul, entrada propia en `/`, exclusivamente siete fases de onboarding. API y almacenamiento separados de la torre original. `npm start` y `npm run start:v2` arrancan V2; la base histórica permanece en `npm run start:legacy` y no se sirve desde V2.

**Es una candidata de revisión local, no una versión autorizada para producción.** El flujo completo documental funciona y genera un paquete real. Las decisiones están autenticadas mediante claves locales por identidad, roles y asignaciones del servidor; se etiquetan `local-review`. No equivalen a identidad Entra, firma legal ni autorización corporativa. No se han ejecutado modelos pagados ni conexiones externas.

## Arranque exacto
Desde `/root/workspaces/dashboardma-onboarding-v2`, con Node >=20:

```sh
cd /root/workspaces/dashboardma-onboarding-v2
node scripts/onboarding-v2-local-review.js
```

El script devuelve JSON con `directory`, `usersFile`, `dataFile` y un comando `start` listo para ejecutar. Crea **nuevas identidades de prueba** con claves aleatorias y fichero modo 0600 en `/root/.hermes/cache/scratch/onboarding-v2-review-…`; no lee ni cambia credenciales existentes. Copia el comando `start` devuelto, por ejemplo (sustituir el sufijo por el real):

```sh
V2_REVIEW_USERS_FILE=/root/.hermes/cache/scratch/onboarding-v2-review-SUFIJO/users.json \
V2_DATA_FILE=/root/.hermes/cache/scratch/onboarding-v2-review-SUFIJO/state.json \
V2_PORT=4191 npm start
```

Antes, comprueba que el puerto esté libre; no mates servicios ajenos. Abrir `http://127.0.0.1:4191/`. Consultar `usersFile` localmente para las claves de `owner` y `reviewer`; no enviarlas por chat ni versionarlas. No introducir contraseñas Microsoft. Sin fichero de identidades válido, no se permite acceso a API. El script no inicia servicios por sí mismo.

- `owner`: editor y coordinador; prepara borradores, asigna y confirma su responsabilidad.
- `reviewer`: reviewer y qa; revisa documentación/plan, aprueba objetos y registra recepción si es destinatario.
- Se pueden configurar más identidades locales con `id`, `roles` y `token` >=16 caracteres; no hay selector cliente capaz de conceder roles.
- Por defecto el servidor escucha **127.0.0.1**. `V2_LISTEN_HOST` existe para el contenedor aislado posterior; no se usó para exponer QA públicamente.
- Sin `V2_DATA_FILE`, usa `data/onboarding-v2/state.json`, nunca `data/state.json`. Para QA usar siempre scratch.
- El scratch se poda por inactividad; para conservación deliberada configurar un archivo V2 privado fuera de Git. No reutilizar datos productivos.

## Recorrido funcional
1. **Enriquecimiento:** título, responsable, contexto/fuera de alcance; fuentes y preguntas con owner, bloqueo, respuesta y motivo. URL/archivo/Azure son referencias, sin lectura implícita. Solo el texto pegado está disponible; no hay extractor PDF.
2. **Tecnologías y áreas:** frentes con ID, entregable, repositorio, owner, reviewer, disciplina, área, dependencias y contrato. Guardar propone; únicamente el owner autenticado confirma. Reasignaciones existentes requieren coordinador. Dependencias desconocidas/cíclicas bloquean.
3. **Specs:** sección `shared` y una por frente; índice navegable, IDs de secciones y criterios críticos. Comentarios vinculados a versión/hash. Las versiones se comparan por fase con antes/después e impacto. La edición se guarda por fase; no hay regeneración IA selectiva.
4. **Validación documental:** estructura/consistencia referencial deterministas; hallazgos con sección, severidad, owner, resolución o excepción motivada/aprobador identificado. El reviewer asignado registra revisión humana; el payload de un editor no puede falsificar esa revisión. Consistencia IA = no ejecutada.
5. **Pruebas:** documento/mockup/contrato/prototipo requieren casos `planned` y plan revisado; no se presentan como QA software ejecutado. Software exige build, entorno, criterio-riesgo-caso, ejecución declarada, resultado, evidencia, executor y reviewer independiente. Todos los criterios críticos deben pasar. Fallos tienen defecto; defectos críticos deben resolverse. Otros defectos necesitan resolución/aceptación y decisión explícita. Revisión de plan/reporte es acción independiente del reviewer QA asignado.
6. **Aprobaciones:** objetos `spec`, `tests` y `front:ID`; cada uno muestra hash, versión, revisor y rol requeridos. Solo ese revisor/rol independiente puede decidir. Devolución necesita motivo. Se conservan decisiones históricas; cambiar y luego revertir contenido no resucita aprobaciones viejas.
7. **Entrega:** asignar destinatario e instrucciones. Sin bloqueos se descarga JSON con archivos lógicos y manifiesto SHA-256, specs/contratos/dependencias, criterios/pruebas/defectos, decisiones/aprobaciones, comentarios/historial/auditoría, sujetos aprobados y límites. Megaprompt es solo un componente. Solo destinatario autenticado confirma recepción del hash exacto; registrar recepción no altera el hash del paquete.

Los borradores incompletos se pueden persistir en cualquier fase. **No se bloquea la navegación de preparación**; sí se bloquean revisiones, aprobaciones y entrega en servidor. El encabezado conserva fase, responsable y versión. Los controles se ajustan a roles, pero la autoridad sigue siendo servidor. Los cambios no guardados avisan al salir; las ediciones fallidas no se borran. Recargar resuelve conflictos de revisión sin sobreescribir silenciosamente.

## Verificación
```sh
npm run check:v2
npm run check
npm run test:v2
npm test
python -m unittest discover -s test -p '*_test.py' -v
```

`test:v2` ejecuta modelo, API HTTP real y Chromium real (si está instalado). El navegador recorre las siete fases contra el servidor real con identidades sintéticas, confirma frente, revisiones, tres aprobaciones, descarga del paquete y recepción, recarga y tamaños 1440x1000 / 390x844. Imprime el directorio scratch de capturas y estado sintético. El test informa `skip` si Chromium no está disponible; eso no se debe contar como verificado.

Comprobar manifiesto de un paquete descargado (el archivo se procesa localmente, no se ejecuta su contenido):
```sh
node --input-type=module -e 'import fs from "node:fs"; import {hash} from "./src/onboarding-v2/model.js"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for(const [n,h] of Object.entries(p.manifest)) if(hash(p.files[n])!==h) throw Error(n); const {hash:h,...body}=p; if(hash(body)!==h) throw Error("package"); console.log("manifest and package verified",h);' /ruta/al/onboarding-v2-package.json
```

SHA-256 se calcula sobre `JSON.stringify` de cada valor lógico y del objeto raíz sin la propiedad `hash`, manteniendo el orden de claves. Es integridad de contenido, no firma criptográfica de una autoridad.

## Arquitectura y límites pendientes
- `src/onboarding-v2/model.js`: reglas, allowlist de payloads, versiones, caducidad, roles/asignaciones, comentarios, manifiesto y paquete.
- `src/onboarding-v2/server.js`: cookie HttpOnly/SameSite Strict, sesión de cuatro horas en memoria, controles de origen para POST, CSP, API cerrada por defecto, serialización de escrituras y rename atómico. Reiniciar conserva expediente, no sesiones.
- `public/onboarding-v2/`: UI ES modules sin CDN ni recursos externos.
- Un expediente por archivo y un proceso escritor por archivo. No implementa multi-proyecto, invitaciones, base de datos transaccional ni lock entre procesos. No ejecutar varias instancias sobre el mismo `V2_DATA_FILE`.
- El coordinador controla cambios de asignación existentes; el alta inicial queda en manos del editor. Los roles nunca proceden del cuerpo HTTP. El modo SSO consume la sesión firmada existente y aplica una allowlist V2 por `tid` + `oid`; falta verificarla con la sesión corporativa real y no hay aislamiento por proyecto.
- Evidencias, repositorios, builds, ejecución de casos y aprobadores de excepciones son declaraciones humanas; la app verifica estructura/trazabilidad y revisión autenticada local, **no** autenticidad externa de archivos/enlaces ni que la ejecución ocurrió realmente.
- Los adaptadores originales `src/enrichment.js`, `src/workspace.js`, `src/wizard.js`, `src/technology-suggestion.js`, `src/azure-import.js` y `scripts/hermes-enrichment-worker.py` se conservan sin modificar y su regresión se ejecuta. **No están conectados a la nueva UI/API V2**. Adaptar su modelo de artefactos y autenticación a V2 es pendiente explícito, no integración verificada. No hay respuestas IA sintéticas presentadas como reales.
- Pendientes: validación de SSO/RBAC contra sesión Entra real (el consumidor firmado ya tiene pruebas locales), integración Azure/worker V2, carga binaria y extracción PDF/URL/Graphify, regeneración selectiva y análisis de impacto semántico, evidencia CI firmada y pruebas de software automáticas, entrega externa por transporte (el paquete se descarga; no se envía email ni a un agente automáticamente).
- La auditoría es append-only a través de la API, no almacenamiento WORM ni protección frente al operador del sistema de archivos.
- Accesibilidad: etiquetas nativas, skip link, live region, foco visible y layout móvil comprobados. No se ha efectuado auditoría formal de lector de pantalla ni WCAG integral.
- Ningún CP se cierra; ningún repositorio se clona; no se implementa ni despliega software. Docker/nginx/deploy históricos no se han adaptado para publicar V2 y no deben usarse como receta de despliegue.

Consultar la matriz de cobertura antes de afirmar que el plan está íntegramente cerrado. No lo está en integraciones externas ni autenticación productiva.
