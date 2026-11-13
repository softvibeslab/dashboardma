# Plan ejecutable — Onboarding V2 independiente

## Objetivo y límites
Crear otra versión funcional centrada exclusivamente en onboarding, manteniendo la identidad visual clara de MobilityApps y las siete fases. Rama feature/onboarding-v2; carpeta /root/workspaces/dashboardma-onboarding-v2. No modificar la aplicación, credenciales, servicios ni datos productivos. No copiar información confidencial al repositorio. No desplegar públicamente ni reemplazar main sin aprobación. Integraciones externas solo se consideran verificadas si se ejecutan; ninguna respuesta IA, evidencia o aprobación será simulada como real.

## Secuencia de implementación
1. Inventariar API, flujo, autenticación y pruebas existentes; definir aislamiento de rutas y almacenamiento. Conservar los adaptadores existentes que sean aplicables, sin fingir nuevas integraciones.
2. Crear entrada y navegación exclusivas del onboarding, encabezado persistente, explicación/acción/bloqueos por fase, estados inequívocos y diseño adaptable/accesible.
3. Enriquecimiento: contexto, fuentes con estado real de extracción, decisiones/preguntas por responsable y bloqueo, selección/comparación de versiones y advertencia de impacto.
4. Tecnologías y áreas: frentes con entregable, repositorio, responsable/revisor, disciplina, área de negocio, confirmación y dependencias; propuestas nunca equivalen a asignaciones confirmadas.
5. Specs: índice y secciones, especificación funcional compartida, identificadores trazables, comentarios por versión y revisión de frentes; regeneración selectiva solo si su integridad está implementada y probada.
6. Validación documental: separar estructura, consistencia asistida (solo ejecución real) y revisión humana; hallazgos con severidad/owner/resolución y excepciones explícitas.
7. Pruebas: seleccionar documento/mockup/contrato/prototipo/software. Antes del desarrollo corresponde plan/revisión de diseño, no QA de software ejecutado. Para software exigir entorno/build y trazabilidad criterio-riesgo-caso-ejecución-evidencia-defecto-decisión; cobertura crítica, estados de reporte y revisión independientes.
8. Aprobaciones: objeto/version/paquete/pendientes visibles, identidad autenticada, decisiones por rol, devolución motivada, caducidad por cambios y control de asignaciones. No firma legal ni autorización de producción.
9. Entrega: paquete estructurado descargable con specs, contratos/dependencias, criterios/pruebas, decisiones, aprobaciones, límites del agente, destinatario y recepción. Megaprompt es un componente. Ningún cierre CP/desarrollo/despliegue implícito.
10. Ejecutar TDD incremental, regresión Node/Python, pruebas de autenticación/aislamiento y recorrido browser escritorio/móvil con datos de prueba claramente identificados. No realizar llamadas pagadas a IA automáticamente.
11. Revisión final: matriz requisito→implementación→prueba→estado, limitaciones reales, informe QA, instrucciones de arranque y commit separado. Publicar rama solo tras revisión de secretos y comprobar remoto si se publica.

## Criterios de aceptación
- V2 accesible y arrancable aisladamente, sin módulos ejecutivos ajenos en navegación.
- Datos independientes; acceso no autorizado no puede mutar ni aprobar; modo local de revisión nunca se presenta como autenticación productiva.
- Flujo de las siete fases con persistencia, bloqueo servidor, revisiones y aprobaciones coherentes con el objeto evaluado.
- Distinguir Propuesto/Generado/Reportado/Ejecutado/Verificado/Pendiente; no inferir lectura de URL, ejecución QA o acceso a repositorios.
- Cambios invalidan decisiones dependientes y muestran impacto, conservando historial.
- Entrega utilizable y verificable, no solo plan o maqueta.
- Pruebas y resultados reportados fielmente; controles/integraciones incompletos figuran como pendientes y no se afirma cobertura total sin evidencia.

## Decisiones de alcance
Se conserva la interfaz actual en producción. Esta entrega es una versión candidata aislada para validación. La conexión pública HTTPS, nuevas credenciales Entra y promoción a producción requieren decisión posterior. Los datos de prueba no representan requerimientos reales ni resultados reales de IA/QA.
