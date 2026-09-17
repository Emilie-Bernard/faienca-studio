// Execute once per dedicated deployment. Never prints or stores secret key material.
import {generateKeyPair,exportPKCS8,exportJWK} from 'jose';
import {spawnSync} from 'node:child_process';
const production=process.argv.includes('--prod');
const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
for(const [name,value] of Object.entries({JWT_PRIVATE_KEY:(await exportPKCS8(privateKey)).trim().replace(/\n/g,' '),JWKS:JSON.stringify({keys:[{use:'sig',...await exportJWK(publicKey)}]})})){
 const result=spawnSync(process.execPath,['node_modules/convex/bin/main.js','env','set',...(production?['--prod']:[]),name,'--',value],{encoding:'utf8'});
 if(result.status!==0)throw new Error(`Impossible de configurer ${name}: ${String(result.error?.message??result.stderr).replaceAll(value,'[secret masqué]').replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g,'[clé masquée]')}`);
 console.log(`${name} configuré sur ${production?'production':'développement'}.`);
}
