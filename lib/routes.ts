/** Adresses des pages du studio : /depenses, /kits/<id>… Un rafraîchissement ramène à la même page. */

/** Page du studio → chemin. « /newsletter » est déjà la page publique d'inscription : le studio prend « /newsletters ». */
export const studioRoutes: Record<string, string> = {
  Accueil: '', Calendrier: 'calendrier', Projets: 'projets', Produits: 'produits', Stratégie: 'strategie', Résultats: 'resultats',
  Newsletter: 'newsletters', Dépenses: 'depenses', Kits: 'kits', Demandes: 'demandes', Questions: 'questions', Clientes: 'clientes',
  Stage: 'stage', Bibliothèque: 'bibliotheque', 'Veille textile': 'veille', 'Journal de l’agent': 'journal-agent',
};

/** Les pages qui ouvrent une fiche : /produits/<id>, /kits/<id>, /stage/<id>.
 *  La veille a des sous-pages : /veille/ateliers, /veille/nouvelles, /veille/videos, /veille/<portrait>, /veille/atelier/<id>. */
export const withDetail = ['Produits', 'Kits', 'Stage', 'Veille textile'];

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
