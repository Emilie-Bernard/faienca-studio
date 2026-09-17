export const contentStatuses = ['À préparer','En production','Programmé','Publié','À recycler'] as const;
export const projectStatuses = ['À envisager','À faire','En cours','Bloqué','Terminé'] as const;
export const stages = ['Astuce','Participation','Projet complet','Offre'] as const;
export const certainties = ['Hypothèse','À tester','Validé'] as const;
export type Kind = 'publication' | 'projet' | 'strategie';
export interface Task { id: string; title: string; done: boolean }
export interface Entry {
  _id: string; kind: Kind; title: string; text: string; status: string;
  date: string; channel: string; format: string; objective: string;
  hook: string; cta: string; stories: string; offer: string; projectId: string;
  stage: string; priority: string; category: string; tasks: Task[];
  url: string; caveat: string; original: string; revision: number;
  reach: number | null; saves: number | null; shares: number | null;
  clicks: number | null; orders: number | null;
}
export type EntryInput = Omit<Entry, '_id' | 'revision'>;
export function emptyEntry(kind: Kind): EntryInput { return {
  kind, title:'', text:'', status:kind==='publication'?'À préparer':kind==='projet'?'À faire':'Hypothèse',
  date:'', channel:'Instagram', format:'Reel', objective:'', hook:'', cta:'', stories:'', offer:'', projectId:'', stage:'Astuce', priority:'Normale', category:'Cible', tasks:[], url:'', caveat:'', original:'', reach:null,saves:null,shares:null,clicks:null,orders:null,
}; }
export function isoToday() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function dateLabel(date: string) { return date ? new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : 'Sans échéance'; }
export function csvEscape(value: unknown) { let s=String(value??''); if(/^[=+@\-\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
export function calendarCsv(entries: Entry[]) {
 const fields: (keyof Entry)[]=['date','title','channel','format','status','stage','objective','hook','text','cta','stories','offer','projectId','url','caveat','reach','saves','shares','clicks','orders'];
 return '\uFEFF'+[fields.join(';'), ...entries.filter(e=>e.kind==='publication').sort((a,b)=>a.date.localeCompare(b.date)).map(e=>fields.map(k=>csvEscape(e[k])).join(';'))].join('\r\n');
}
