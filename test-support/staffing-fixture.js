import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ClassificationStore} from '../src/onboarding-v2/classifications.js';
// Synthetic identities and catalog only. Never a production assignment.
export async function staffingFixture(){
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','staffing-test-'));
 const source=join(dir,'source.json'),file=join(dir,'catalog.json');
 const directory={source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'az-owner',name:'Responsable de prueba',projects:['P1','P2']},{id:'az-reviewer',name:'Revisor de prueba',projects:['P1']},{id:'az-disabled',name:'No habilitado de prueba',projects:['P1']}]};
 const catalog={revision:9,fronts:[{id:'C1',name:'Android',active:true},{id:'C2',name:'Web',active:false}],participations:[{userId:'az-owner',frontId:'C1',roles:['developer'],projects:['P1'],enabled:true,level:'principal'},{userId:'az-reviewer',frontId:'C1',roles:['reviewer'],projects:['P1'],enabled:true,level:'secondary'},{userId:'az-disabled',frontId:'C1',roles:['developer'],projects:['P1'],enabled:false}],directory:{source:'not-imported',users:[]},audit:[]};
 await writeFile(source,JSON.stringify(directory));await writeFile(file,JSON.stringify(catalog));
 return {dir,source,file,directory,catalog,store:new ClassificationStore(file,{directoryFile:source}),identities:[{id:'owner',roles:['editor','coordinator'],azureIdentityKey:'az-owner'},{id:'reviewer',roles:['reviewer'],azureIdentityKey:'az-reviewer'}]};
}
