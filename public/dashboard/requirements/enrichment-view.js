const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (items) => `<ul>${(items || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;

export function renderEnrichedVersion(version) {
  if (!version?.cp0 || !version?.cp1) return '';
  const cp0 = version.cp0; const cp1 = version.cp1;
  return `<div class="detail-block"><h3>Documento enriquecido v${esc(version.version)} · PROPUESTO</h3>${version.sourceChanged ? '<p>ATENCIÓN: el requerimiento cambió mientras Hermes trabajaba. Esta versión corresponde a la fuente anterior; revisa o vuelve a enriquecer.</p>' : ''}<p>${esc(version.summary)}</p><p class="muted">Generado por ${esc(version.createdBy)} · ${esc(version.model)} · ${esc(version.createdAt)}. Pendiente de revisión humana.</p>
    <h3>CP0 · Necesidad y alcance</h3><p>${esc(cp0.businessNeed)}</p><p>Resultado esperado: ${esc(cp0.expectedOutcome)}</p><h4>Dentro del alcance</h4>${list(cp0.inScope)}<h4>Fuera del alcance</h4>${list(cp0.outOfScope)}<h4>Actores</h4>${list(cp0.actors)}<h4>Dependencias y riesgos</h4>${list([...(cp0.dependencies || []), ...(cp0.risks || [])])}
    <h3>CP1 · Historia y reglas propuestas</h3><p>${esc(cp1.userStory)}</p><p>${esc(cp1.functionalNarrative)}</p><h4>Reglas</h4>${list(cp1.rules)}<h4>Datos y supuestos a validar</h4>${list([...(cp1.data || []), ...(cp1.assumptions || [])])}
    <h3>Repositorios y sistemas necesarios</h3>${list(version.repositories)}
    <h3>Criterios de aceptación</h3>${list(version.acceptanceCriteria)}<h3>Escenarios QA · PLAN GENERADO</h3>${list(version.testScenarios)}<h4>Datos de prueba propuestos</h4>${list(version.testData)}
    <h3>Trazabilidad propuesta</h3>${(version.traceability || []).map((row) => `<div class="source-box"><strong>${esc(row.requirement)}</strong><p>Riesgo: ${esc(row.risk)}</p><p>Prueba: ${esc(row.test)}</p><p>Evidencia requerida, no ejecutada: ${esc(row.evidence)}</p></div>`).join('')}
    <h3>Revisión crítica de Hermes</h3>${list(version.critic?.findings)}<p class="muted">Esta revisión de IA no sustituye la aprobación de Negocio, Producto, Arquitectura o QA.</p>
    <h3>Listo para CP2: PENDIENTE</h3>${list(version.cp2Readiness?.blockers)}
    <h3>Fuentes y límites de evidencia</h3><p class="muted">${esc(version.evidenceBoundary)}</p>${list((version.sources || []).map((source) => `${source.name || source.id}: ${source.contentStatus}`))}</div>`;
}
