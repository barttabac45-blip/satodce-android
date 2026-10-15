import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {connectSatoDCE} from './connector/bridge.mjs';
const reader=await readFile(new URL('./connector/fc-reader.js',import.meta.url),'utf8');
// Version 3 prevents older hosted sites from automatically importing on hello.
const bridge=connectSatoDCE.toString().replace("version:4,intent,", "version:3,resume:true,intent,");
const source=`(()=>{${reader}\n(${bridge})('https://satodce.fr','resume',true);})();`;
const dir=new URL('./app/src/main/assets/',import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL('reconnect.js',dir),source);
await writeFile(new URL('sync-team.js',dir),`(()=>{${reader}\n(${connectSatoDCE.toString()})('https://satodce.fr','club',true);})();`);
console.log('Android reconnect connector built');
