# Onboarding V3 — incremento revisable, no publicado

## Dirección y límites
Base técnica: `4aef828906bc318ad28e2993803d5abdbdead15d`. Rama `feature/onboarding-v3`. Recuperar la entrada y el recorrido familiar V1; no renombrar V2 ni alterar sus datos. Modo Operate: sidebar, rail de siete etapas, título «Del contexto a la entrega», preguntas antes del contexto extenso. Se reutilizan los tokens/CSS de V1 comprobados contra el contenedor, no su estado operativo ni sus llamadas API antiguas.

## Incremento ejecutado
- [x] Entrada independiente `/dashboard/onboarding-v3`, assets/API propios, cookie local V3 y almacén dedicado.
- [x] Entrada V1 adaptada: edición manual, preguntas visibles, guardar, recargar, historial/diff y advertencia de cambios sin guardar.
- [x] Azure ID/título → selección → confirmación → intake; proyecto autorizado agileNestCorp. Original separado, comentarios/hijos/adjuntos y estados del conector V2 conservados.
- [x] Opción broker LLM sin agente, deshabilitada por defecto, sin proveedor/credenciales en navegador.
- [x] Catálogo fuente de solo lectura, filtro nombre/frente/función/proyecto; sin inferir participaciones ni permisos.
- [x] Gobierno de fases 2–7 reutilizable en `/advanced`; probado Stage 2 con backend real y datos sintéticos.
- [x] SSO exacto tenant+oid, origen, roles, imagen ejecutable no-root y receta sin routing/puertos publicados.

## Pendientes deliberados
La integración visual de fases 2–7 aún utiliza la superficie avanzada heredada de V2, no una reproducción completa de V1. Solo un borrador activo por almacén V3, con reemplazos versionados; no existe todavía una bandeja multi-expediente V1. No se migran datos automáticamente. Falta revisión humana corporativa y configuración autorizada de fuentes/credenciales. No se ejecutó Azure real ni inferencia nueva ni se publicaron datos. No hay carga/capacidad real, OCR/PDF, publicación Azure ni agente Hermes.

## TDD y verificación
Tests V3 añadidos primero: servidor ausente → fallo; recorrido navegador sin app → fallo; adaptador ausente → fallo. Implementación y regresión posteriores verdes. El primer oráculo móvil precisó scroll instantáneo (la hoja heredada usaba desplazamiento animado), sin ocultar fallos de negocio. Ver `../onboarding-v3/QA.md`.
