import test from 'node:test';
import assert from 'node:assert/strict';
import {renderImportedContext} from '../public/onboarding-v3/imported-context.js';
test('Missing source fields are explicit and long source text is bounded with accessible full-text disclosure',()=>{
 const missing=renderImportedContext(intake({}));assert.match(missing.summary,/No registrados en la fuente/);assert.doesNotMatch(missing.summary,/Asignado a|Actualizado en Azure|<details/);
 const long='Inicio. '+('Detalle sintético. '.repeat(100))+' FINAL ÚNICO';
 const rendered=renderImportedContext(intake({'System.Description':long,'Microsoft.VSTS.Common.AcceptanceCriteria':long}));
 assert.match(rendered.summary,/<details class="azure-full-text"><summary>Ver descripción completa<\/summary>/);assert.match(rendered.summary,/Ver criterios completos/);assert.match(rendered.summary,/FINAL ÚNICO/);assert.ok(rendered.summary.indexOf('…')<rendered.summary.indexOf('<details'));
 assert.match(rendered.summary,/vista extractiva/);
});
test('Children retain recorded titles and failures; attachments retain names and extraction status',()=>{
 const source=intake({});source.snapshot.children=[{id:12,rev:1,fields:{'System.Title':'Hijo <seguro>'}},{id:13}];source.snapshot.root.attachments=[{name:'Evidencia <segura>.pdf',status:'metadata-only'},{name:'Leído.txt',status:'extracted'}];
 const {resources}=renderImportedContext(source);assert.match(resources,/<h4>#12 · Hijo &lt;seguro&gt; · leído · rev 1<\/h4>/);assert.match(resources,/lectura fallida \/ no usado/);assert.match(resources,/Evidencia &lt;segura&gt;.pdf/);assert.match(resources,/solo metadata; no enviado como texto/);assert.match(resources,/leído: texto extraído/);
});
const intake=fields=>({version:2,sourceHash:'unchanged',snapshot:{organization:'https://dev.azure.com/MobileappsAmerica',project:'agileNestCorp',root:{id:2796,rev:4,fields:{'System.TeamProject':'agileNestCorp',...fields}},children:[]}});
test('Azure summary presents source title, readable description, criteria and recorded metadata without mutation',()=>{
 const original=intake({'System.Title':'Solicitud <segura>','System.State':'Active','System.WorkItemType':'User Story','System.Description':'&lt;p&gt;Permitir acceso &amp;amp; consulta.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Desde móvil&lt;/li&gt;&lt;/ul&gt;','Microsoft.VSTS.Common.AcceptanceCriteria':'<p>Conservar sesión</p><script>alert(1)</script><img src=x onerror=alert(2)>','System.AssignedTo':{displayName:'Ana sintética',uniqueName:'private@example.test'},'System.AreaPath':'Proyecto\\App','System.IterationPath':'Sprint 2','System.ChangedDate':'2026-11-01T12:00:00Z'});
 const before=JSON.stringify(original),{summary,resources}=renderImportedContext(original);
 assert.match(summary,/Resumen del requerimiento en Azure/);assert.match(summary,/Solicitud &lt;segura&gt;/);assert.match(summary,/Permitir acceso &amp; consulta\./);assert.match(summary,/Desde móvil/);assert.match(summary,/Conservar sesión/);assert.match(summary,/Active/);assert.match(summary,/User Story/);assert.match(summary,/Ana sintética/);assert.match(summary,/Sprint 2/);assert.doesNotMatch(summary,/<script|<img|alert\(|\[object Object\]|private@example/);assert.match(resources,/<details><summary>Detalle de recursos y lectura<\/summary>/);assert.match(resources,/Contexto LLM:/);assert.equal(JSON.stringify(original),before);
});
