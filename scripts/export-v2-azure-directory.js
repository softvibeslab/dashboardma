import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectAzureDirectory} from '../src/onboarding-v2/classifications.js';
// Operator-only projection: read existing authorized snapshot, never expose the ERP/backlog or secrets.
const [source,output]=process.argv.slice(2);
if(!source||!output||resolve(source)===resolve(output))throw Error('Uso: node scripts/export-v2-azure-directory.js <snapshot autorizado> <salida privada distinta>');
const directory=projectAzureDirectory(JSON.parse(await readFile(resolve(source),'utf8')));
await mkdir(dirname(resolve(output)),{recursive:true,mode:0o700});
const temporary=resolve(output)+'.'+randomUUID()+'.pending';
await writeFile(temporary,JSON.stringify(directory,null,2),{mode:0o600});await rename(temporary,resolve(output));
console.log(JSON.stringify({source:directory.source,syncedAt:directory.syncedAt,users:directory.users.length,mode:'projection-only-not-live-azure'}));
