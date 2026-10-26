/** Adresses des pages du studio : /depenses, /kits/<id>… Un rafraîchissement ramène à la même page. */

/** Page du studio → chemin. « /newsletter » est déjà la page publique d'inscription : le studio prend « /newsletters ». */
export const studioRoutes: Record<string, string> = {
  Accueil: '', Calendrier: 'calendrier', Produits: 'produits', Concurrentes: 'concurrentes',
  Newsletter: 'newsletters', Dépenses: 'depenses', Kits: 'kits', Demandes: 'demandes', Questions: 'questions', Clientes: 'clientes',
  Stage: 'stage', Bibliothèque: 'bibliotheque', 'Veille textile': 'veille', 'Journal de l’agent': 'journal-agent',
};

/** Les pages qui ouvrent une fiche : /produits/<id>, /concurrentes/<id>, /kits/<id>, /stage/<id>.
 *  La veille a des sous-pages : /veille/ateliers, /veille/nouvelles, /veille/videos, /veille/<portrait>, /veille/atelier/<id>. */
export const withDetail = ['Produits', 'Concurrentes', 'Kits', 'Stage', 'Veille textile'];

export function studioPath(view: string, id?: string | null): string {
  const slug = studioRoutes[view] ?? '';
  return '/' + slug + (slug && id && withDetail.includes(view) ? '/' + id.split('/').map(encodeURIComponent).join('/') : '');
}

/** Chemin → page et fiche ouverte ; une adresse inconnue ramène à l'accueil. */
export function parseStudioPath(pathname: string): { view: string; id: string | null; known: boolean } {
  const [slug = '', ...rest] = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const view = Object.keys(studioRoutes).find(v => studioRoutes[v] === slug.toLowerCase());
  const depth = view === 'Veille textile' ? 2 : 1;
  if (view === undefined || rest.length > depth || (rest.length && !withDetail.includes(view))) return { view: 'Accueil', id: null, known: slug === '' };
  return { view, id: rest.length ? rest.map(decodeURIComponent).join('/') : null, known: true };
}

const segments = (pathname: string) => pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(decodeURIComponent);
const join = (...parts: string[]) => '/' + parts.filter(Boolean).map(encodeURIComponent).join('/');

/** Espace stagiaire : /, /missions/<id>, /projets, /bibliotheque, /veille (et ses sous-pages). */
export type TraineeTab = 'missions' | 'projects' | 'library' | 'veille';
export type TraineeRoute = { tab: TraineeTab; missionId: string | null; veille: string };
const traineeSlugs: Record<TraineeTab, string> = { missions: 'missions', projects: 'projets', library: 'bibliotheque', veille: 'veille' };

export function parseTraineePath(pathname: string): TraineeRoute {
  const [slug = '', ...rest] = segments(pathname);
  const home: TraineeRoute = { tab: 'missions', missionId: null, veille: '' };
  if (slug === 'missions' && rest.length <= 1) return { ...home, missionId: rest[0] ?? null };
  if (slug === 'veille' && rest.length <= 2) return { ...home, tab: 'veille', veille: rest.join('/') };
  const tab = (Object.keys(traineeSlugs) as TraineeTab[]).find(t => traineeSlugs[t] === slug);
  return tab && !rest.length ? { ...home, tab } : home;
}

export function traineePath(r: TraineeRoute): string {
  if (r.tab === 'missions') return r.missionId ? join('missions', r.missionId) : '/';
  if (r.tab === 'veille') return '/veille' + (r.veille ? '/' + r.veille.split('/').map(encodeURIComponent).join('/') : '');
  return join(traineeSlugs[r.tab]);
}

/** Espace brodeuse : / (mes kits), /catalogue, /kits/<id>. */
export type ClientRoute = { view: 'kits' | 'catalogue'; kitId: string | null };

export function parseClientPath(pathname: string): ClientRoute {
  const [slug = '', id, ...rest] = segments(pathname);
  if (slug === 'catalogue' && !id) return { view: 'catalogue', kitId: null };
  if (slug === 'kits' && !rest.length) return { view: 'kits', kitId: id ?? null };
  return { view: 'kits', kitId: null };
}

export const clientPath = (r: ClientRoute) => r.kitId ? join('kits', r.kitId) : r.view === 'catalogue' ? '/catalogue' : '/';
