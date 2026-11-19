import {importProposal} from '../onboarding-v2/azure-proposal.js';
import {digest} from '../onboarding-v2/model.js';
const organization='https://dev.azure.com/MobileappsAmerica',project='agileNestCorp';
export function workItemUrl(id,scope){
 return scope===project&&Number.isSafeInteger(id)&&id>0?`${organization}/${project}/_workitems/edit/${id}`:null;
}
export function snapshotUrl(snapshot){
 if(snapshot?.organization!==organization||snapshot.project!==project||snapshot.root?.fields?.['System.TeamProject']!==project)return null;
 return workItemUrl(snapshot.root.id,project);
}
// Decorate only V3: never follow or trust Azure-supplied HTML URLs.
export function v3AzureLinks(connector){
 return {
  configured:()=>connector.configured(),
  async search(query){const result=await connector.search(query);return {...result,items:result.items.map(item=>({...item,webUrl:workItemUrl(item.id,item.project)}))};},
  async read(id){
   const snapshot=await connector.read(id);
   if(snapshot.root?.id!==id||!snapshotUrl(snapshot))throw Object.assign(Error('Azure: identidad/proyecto de fuente inválido.'),{status:502});
   return {...snapshot,root:{...snapshot.root,webUrl:snapshotUrl(snapshot)},children:snapshot.children.map(item=>({...item,...(item.fields?.['System.TeamProject']===project?{webUrl:workItemUrl(item.id,project)}:{})}))};
  }
 };
}
export function importLinkedProposal(state,snapshot,actor,input){
 const next=importProposal(state,snapshot,actor,input);
 const items=[snapshot.root,...snapshot.children];
 next.phases[1].sources.forEach(source=>{
  const item=items.find(i=>source.id===`AZ-${i.id}-r${i.rev}`);
  const url=item?.fields?.['System.TeamProject']===project&&workItemUrl(item.id,project);
  if(url)source.text=url;
 });
 next.azureIntakes.at(-1).proposalHash=digest(next);
 return next;
}
