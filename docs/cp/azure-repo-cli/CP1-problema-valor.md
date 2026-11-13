# CP1 — Problema, valor y definición de éxito

**Estado:** GENERADO / BLOQUEADO PARA BASELINE HASTA AUTENTICACIÓN Y ALCANCE
**Iniciativa:** `INI-AZURE-REPO-CLI-001`
**Precede a:** CP0 — Intake
**Siguiente CP propuesto:** CP2 — SPEC técnica y contrato de sincronización

## 1. Problema de negocio/operación

Los repositorios de Azure DevOps y sus clones locales no tienen todavía un flujo único, verificable y gobernado que permita saber:

- qué repositorios existen realmente en Azure;
- qué clone local corresponde a cada remoto;
- qué rama es la canónica;
- si un clone está actualizado, atrasado, divergente o con cambios locales;
- si el bloqueo es de autenticación, red, rama o trabajo local;
- cuándo se verificó por última vez el estado.

El preflight real confirmó que el acceso actual está bloqueado por un PAT expirado y que no hay sesión Entra activa. Por eso no es válido afirmar todavía que los clones estén sincronizados con Azure.

## 2. Valor esperado

Un proceso CLI gobernado debe reducir:

- trabajo manual repetido de revisión de repositorios;
- riesgo de trabajar sobre una rama o clone equivocado;
- pérdida de cambios locales por comandos destructivos;
- diagnósticos ambiguos de autenticación o divergencia;
- falta de trazabilidad para QA, DevOps y la Control Tower.

Debe habilitar:

- descubrimiento reproducible;
- sincronización local segura;
- alertas accionables;
- estado read-only en la Control Tower;
- posterior indexación correcta en Graphify/Codebase Memory.

## 3. Usuarios y jobs-to-be-done

### DevOps/Desarrollo

"Quiero actualizar los clones autorizados sin perder trabajo local y saber exactamente cuáles quedaron bloqueados."

### Owner de repositorio

"Quiero recibir una alerta cuando mi repositorio esté divergente, sucio o sin acceso."

### QA/Control Tower

"Quiero ver evidencia de remoto, rama, commit y fecha de sincronización sin depender de mensajes de chat."

## 4. Hipótesis de solución

Si autenticamos Azure DevOps por un mecanismo no interactivo seguro, descubrimos repositorios de forma read-only y aplicamos `fetch` seguido de `merge --ff-only` solo en clones limpios, entonces podremos mantener un inventario local confiable y reportar bloqueos sin introducir cambios destructivos.

Esta hipótesis debe validarse primero con tres repositorios, no con un lote completo.

## 5. Alcance de CP1

### Incluido

- Azure DevOps CLI.
- Git local.
- Inventario remoto/local.
- Clasificación de estado.
- Evidencia.
- Integración read-only posterior con la Control Tower.

### No incluido

- Push o PR automáticos.
- Merge/rebase automático ante divergencia.
- Cambios de permisos.
- Resolución de conflictos.
- Aprobación humana automática.

## 6. Indicadores de éxito propuestos

Estos umbrales requieren aprobación/baseline antes de convertirse en Quality Gates:

- 100% de los repositorios del piloto identificados por nombre, id y web URL token-free.
- 100% con ruta local y rama canónica confirmadas.
- 100% con resultado de `fetch` clasificado.
- 0 comandos destructivos ejecutados.
- 100% de repositorios bloqueados con motivo explícito.
- 100% de la evidencia sin tokens, secretos o userinfo en remotes.

## 7. Reglas de seguridad

- No usar ni solicitar PAT por Telegram.
- Preferir `az login --use-device-code`/Entra cuando la organización lo permita.
- No colocar tokens en argumentos, URLs o logs.
- No tratar un remote local cacheado como prueba de acceso actual.
- No actualizar un árbol sucio.
- No usar `reset --hard`, `clean -fd`, rebase ni force push.
- Mantener los repositorios aislados por cliente/proyecto.
- Indexar Graphify/Codebase Memory solo después de verificar path y commit.

## 8. Criterios de aceptación CP1

- `AC1`: Azure CLI autentica sin exponer secretos.
- `AC2`: `az repos list` devuelve el proyecto aprobado.
- `AC3`: el piloto tiene tres repositorios exactos y rutas aprobadas.
- `AC4`: el preestado registra rama, upstream, HEAD y working tree.
- `AC5`: `fetch --all --prune` se ejecuta por repositorio y se clasifica.
- `AC6`: solo clones limpios y fast-forward elegibles se actualizan.
- `AC7`: divergentes/sucios quedan pendientes, no se fuerzan.
- `AC8`: se genera evidencia usable por Control Tower.
- `AC9`: no se realizan escrituras remotas.

## 9. Decisiones pendientes

- mecanismo final de autenticación: Entra/SSH/PAT administrado;
- frecuencia del sincronizador;
- almacenamiento durable del catálogo y evidencia;
- owner y SLA de cada alerta;
- rama canónica por repositorio;
- aprobación de indexación Graphify/Codebase Memory;
- definición de Quality Gates CP2.

## 10. Resultado CP1

**CP1 no puede baselinarse todavía** porque el acceso Azure DevOps está bloqueado por autenticación expirada y no hay confirmación de los tres repositorios piloto.

**Siguiente acción:** completar login Azure DevOps de forma interactiva, validar `mobileApps` y devolver la lista exacta de repositorios piloto. Después se prepara CP2 con el contrato de datos, estados, evidencia y automatización.
