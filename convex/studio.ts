import { queryGeneric as query, mutationGeneric as mutation, type GenericQueryCtx, type GenericDataModel } from 'convex/server';
import {v,ConvexError} from 'convex/values';
import {getAuthUserId} from '@convex-dev/auth/server';
import {entryFields} from './schema';
import {contentStatuses,projectStatuses,certainties,stages,type EntryInput} from '../lib/model';
import seeds from './seed.json';

async function owner(ctx: GenericQueryCtx<GenericDataModel>) {
 const id=await getAuthUserId(ctx); if(!id) throw new ConvexError('Connexion requise.');
 const user=await ctx.db.get(id);
 if(!process.env.OWNER_GITHUB_ID || user?.githubId!==process.env.OWNER_GITHUB_ID) throw new ConvexError('Accès réservé à la propriétaire.');
 return id;
}
function validate(e:EntryInput) {
 if(!e.title.trim() || e.title.length>200) throw new ConvexError('Le titre doit contenir entre 1 et 200 caractères.');
 const statuses=e.kind==='publication'?contentStatuses:e.kind==='projet'?projectStatuses:certainties;
 if(!(statuses as readonly string[]).includes(e.status)) throw new ConvexError('Statut invalide.');
 if(e.date && (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date)) throw new ConvexError('Date invalide.');
 if(e.url && !/^https?:\/\//i.test(e.url)) throw new ConvexError('Le lien doit commencer par https:// ou http://.');
 if(e.kind==='publication' && !(stages as readonly string[]).includes(e.stage)) throw new ConvexError('Étape invalide.');
 for(const key of ['reach','saves','shares','clicks','orders'] as const) if(e[key]!==null&&(!Number.isSafeInteger(e[key])||e[key]!<0)) throw new ConvexError('Les résultats doivent être des nombres entiers positifs ou vides.');
 if(e.tasks.length>100 || e.tasks.some(t=>!t.title.trim()) || new Set(e.tasks.map(t=>t.id)).size!==e.tasks.length) throw new ConvexError('Liste de tâches invalide.');
}
export const list=query({args:{},handler:async(ctx)=>{await owner(ctx);return await ctx.db.query('entries').collect();}});
export const save=mutation({args:{id:v.optional(v.id('entries')),revision:v.optional(v.number()),data:v.object(entryFields)},handler:async(ctx,{id,revision,data})=>{
 await owner(ctx);validate(data);
 if(data.projectId) { const projectId=ctx.db.normalizeId('entries',data.projectId); const project=projectId?await ctx.db.get(projectId):null; if(!project||project.kind!=='projet') throw new ConvexError('Projet associé introuvable.'); }
 if(id){const before=await ctx.db.get(id);if(!before)throw new ConvexError('Élément introuvable.');if(before.kind!==data.kind)throw new ConvexError('Type immuable.');if(before.revision!==revision)throw new ConvexError('Modifié dans une autre session. Votre brouillon est conservé : rechargez la fiche avant de fusionner vos changements.');await ctx.db.patch(id,{...data,revision:before.revision+1});return id;}
 return await ctx.db.insert('entries',{...data,revision:1});
}});
export const remove=mutation({args:{id:v.id('entries'),revision:v.number()},handler:async(ctx,{id,revision})=>{
 await owner(ctx);const before=await ctx.db.get(id);if(!before)throw new ConvexError('Élément introuvable.');if(before.revision!==revision)throw new ConvexError('La fiche a changé. Rechargez-la.');
 if(before.kind==='projet')for(const e of await ctx.db.query('entries').collect())if(e.projectId===id)await ctx.db.patch(e._id,{projectId:'',revision:e.revision+1});
 await ctx.db.delete(id);
}});
export const initialize=mutation({args:{},handler:async(ctx)=>{
 await owner(ctx);const version='faienca-2026-v1';if(await ctx.db.query('seeds').withIndex('version',q=>q.eq('version',version)).first())return {inserted:0};
 const ids:Record<string,string>={};let inserted=0;
 for(const s of seeds.filter(e=>e.data.kind==='projet')){ids[s.key]=await ctx.db.insert('entries',{...s.data,...{kind:'projet' as const},revision:1,seedKey:s.key});inserted++;}
 for(const s of seeds.filter(e=>e.data.kind!=='projet')){const data={...s.data,kind:s.data.kind as EntryInput['kind'],projectId:ids[s.data.projectId]??''};validate(data);await ctx.db.insert('entries',{...data,revision:1,seedKey:s.key});inserted++;}
 await ctx.db.insert('seeds',{version});return {inserted};
}});
