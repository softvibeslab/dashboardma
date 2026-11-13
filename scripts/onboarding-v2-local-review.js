import {mkdtemp,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
// New local-review identities only. No production credentials or existing configuration are read or changed.
const directory=await mkdtemp('/root/.hermes/cache/scratch/onboarding-v2-review-');
const usersFile=join(directory,'users.json'),dataFile=join(directory,'state.json');
const users=[{id:'owner',roles:['editor','coordinator'],token:randomBytes(32).toString('hex')},{id:'reviewer',roles:['reviewer','qa'],token:randomBytes(32).toString('hex')}];
await writeFile(usersFile,JSON.stringify(users,null,2),{mode:0o600});
console.log(JSON.stringify({directory,usersFile,dataFile,mode:'local-review',start:`V2_REVIEW_USERS_FILE=${usersFile} V2_DATA_FILE=${dataFile} V2_PORT=4191 npm start`,keys:'Read usersFile locally. Do not put keys in chat, Git or production configuration.'},null,2));
