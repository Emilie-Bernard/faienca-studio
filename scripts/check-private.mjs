import {ConvexHttpClient} from 'convex/browser';
import {anyApi} from 'convex/server';
const url=process.argv[2];
if(!url)throw new Error('Indiquer l’URL Convex à vérifier.');
const client=new ConvexHttpClient(url);
for(const [name,operation] of [['lecture',()=>client.query(anyApi.studio.list,{})],['initialisation',()=>client.mutation(anyApi.studio.initialize,{})]]){
 let rejected=false;try{await operation()}catch(e){if(e.data==='Connexion requise.')rejected=true;else throw e;}
 if(!rejected)throw new Error(`Échec : ${name} autorisée sans connexion.`);
 console.log(`OK : ${name} refusée sans connexion sur ${url}`);
}
