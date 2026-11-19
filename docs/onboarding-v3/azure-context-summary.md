# V3 · Resumen de contexto Azure

El panel presenta una proyección de solo lectura del snapshot importado antes de **Enriquecer con Hermes**: título, tipo, estado, proyecto, revisión, descripción y criterios originales. Asignado (displayName), área, iteración y fecha de cambio aparecen solo si constan en la fuente.

- Conversión pura HTML/entidades → texto escapado; no inserta markup Azure ni descarga imágenes, scripts o enlaces incrustados.
- Vista extractiva inicial: hasta 320 caracteres de descripción y 240 de criterios, sin inventar reglas ni conclusiones. Un disclosure nativo permite consultar y volver a contraer el texto completo normalizado. El snapshot original sigue disponible sin alteraciones.
- Los campos ausentes se indican como **No registrados en la fuente**. Los contadores y la declaración de contexto LLM están bajo **Detalle de recursos y lectura**; se mantienen los estados de hijos y adjuntos y sus límites de lectura/extracción.
- No cambia el payload LLM, fuente/hash, versiones, continuidad CP, enlaces Azure validados ni el botón de enriquecimiento. Renderizar/expandir no importa, genera propuestas, invoca inferencia ni escribe en Azure.

Verificación: `test/v3-imported-context.test.js`, `test/v3-azure-links.test.js` y `test/v3-browser.test.js` (Chromium desktop/móvil contra backend real con fuentes sintéticas; normalización, XSS, expansión/contracción, reload, byte-identidad del estado). Las propuestas de inferencia del test de recorrido usan exclusivamente un transporte fixture; no son ejecuciones de IA.

La publicación usa un archivo Git del commit exacto, las tres capas Compose V3 existentes y respaldos privados verificados del runtime/datos. Las evidencias operativas y respaldos permanecen fuera de Git. Una sesión corporativa humana no se suplanta para QA.
