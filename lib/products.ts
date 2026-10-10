/** Produits de la boutique : kits de broderie et modèles PDF. */
export const productTypes = ['kit', 'pdf'] as const;
export type ProductType = typeof productTypes[number];
export const productTypeLabels: Record<ProductType, string> = { kit: 'Kit', pdf: 'Modèle PDF' };
export const productStatuses = ['Idée', 'En conception', 'Prototype', 'Tests', 'Prêt à lancer', 'En vente'] as const;
export const pdfLanguages = ['fr', 'en', 'es'] as const;
export type PdfLanguage = typeof pdfLanguages[number];
export const pdfLanguageLabels: Record<PdfLanguage, string> = { fr: 'Français', en: 'English', es: 'Español' };
/** « kit » : fourni dans la boîte. « atelier » : outils, emballage, impression… nécessaires pour fabriquer les kits. */
export const materialPurposes = ['kit', 'atelier'] as const;
export type MaterialPurpose = typeof materialPurposes[number];
export const materialPurposeLabels: Record<MaterialPurpose, string> = { kit: 'Dans le kit', atelier: 'Pour fabriquer' };

export interface ProductFile { id: string; label: string; url: string; storageId?: string }
export interface ShopLink { id: string; shop: string; url: string; note: string }
export interface Material { id: string; name: string; quantity: string; purpose: MaterialPurpose; unitCost: number | null; bought: boolean; notes: string; links: ShopLink[] }
export interface ContentItem { id: string; name: string; notes: string }
export interface ProductTask { id: string; title: string; done: boolean }
export interface ProductInput {
  type: ProductType; title: string; description: string; status: string; price: number | null; shopUrl: string; coverUrl: string;
  linkedKitId: string; contents: ContentItem[]; materials: Material[]; pdfs: Partial<Record<PdfLanguage, ProductFile>>; tasks: ProductTask[];
}

const task = (title: string): ProductTask => ({ id: crypto.randomUUID(), title, done: false });

/** Liste de départ pour mettre un produit sur le marché. */
export const launchChecklist = (type: ProductType): ProductTask[] => (type === 'kit' ? [
  'Valider le motif et le niveau visé', 'Broder le prototype complet', 'Lister les matériaux et trouver les fournisseurs', 'Calculer le coût de revient et fixer le prix',
  'Rédiger la notice en français', 'Traduire la notice en anglais et en espagnol', 'Faire tester le kit par 2 ou 3 brodeuses', 'Corriger la notice selon les retours',
  'Commander les matériaux et préparer la première série', 'Préparer l’emballage, l’étiquette et la carte avec le code d’activation', 'Photographier le contenu et le résultat',
  'Ajouter les leçons vidéo dans l’espace brodeuses', 'Créer la fiche produit dans la boutique', 'Annoncer le lancement (newsletter, Instagram)',
] : [
  'Dessiner le motif', 'Broder un exemplaire pour vérifier le dessin', 'Rédiger les instructions et le schéma des points', 'Mettre en page le PDF en français',
  'Traduire le PDF en anglais et en espagnol', 'Relire les trois versions', 'Fixer le prix', 'Créer les visuels de présentation',
  'Créer la fiche produit et ajouter les fichiers à télécharger', 'Tester l’achat et le téléchargement', 'Annoncer le lancement (newsletter, Instagram)',
]).map(task);

export const emptyProduct = (type: ProductType = 'kit'): ProductInput => ({
  type, title: '', description: '', status: 'Idée', price: null, shopUrl: '', coverUrl: '', linkedKitId: '',
  contents: [], materials: [], pdfs: {}, tasks: launchChecklist(type),
});
export const newContent = (): ContentItem => ({ id: crypto.randomUUID(), name: '', notes: '' });
export const newMaterial = (purpose: MaterialPurpose = 'kit'): Material => ({ id: crypto.randomUUID(), name: '', quantity: '', purpose, unitCost: null, bought: false, notes: '', links: [] });
export const newShopLink = (): ShopLink => ({ id: crypto.randomUUID(), shop: '', url: '', note: '' });
export const newTask = (title = ''): ProductTask => task(title);

const https = (s: string) => /^https:\/\//i.test(s);
const money = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n < 100000);

/** Renvoie un message d'erreur en français, ou null si le produit est valide. */
export function productError(p: ProductInput): string | null {
  if (!p.title.trim() || p.title.length > 200) return 'Le titre doit contenir entre 1 et 200 caractères.';
  if (p.description.length > 5000) return 'La description ne peut pas dépasser 5 000 caractères.';
  if (!(productStatuses as readonly string[]).includes(p.status)) return 'Statut inconnu.';
  if (!money(p.price)) return 'Le prix est invalide.';
  if (p.shopUrl && !https(p.shopUrl)) return 'Le lien de la fiche boutique doit commencer par https://.';
  if (p.coverUrl && !https(p.coverUrl)) return 'L’image de couverture doit commencer par https://.';
  if (p.contents.length > 60) return 'Le contenu est limité à 60 éléments.';
  if (p.materials.length > 100) return 'La liste est limitée à 100 matériaux.';
  if (p.tasks.length > 100) return 'La checklist est limitée à 100 tâches.';
  for (const list of [p.contents, p.materials, p.tasks]) if (new Set(list.map(x => x.id)).size !== list.length) return 'Identifiants dupliqués.';
  for (const [i, c] of p.contents.entries()) if (!c.name.trim() || c.name.length > 200 || c.notes.length > 500) return `Contenu ${i + 1} : ajoutez un nom (200 caractères maximum).`;
  for (const [i, m] of p.materials.entries()) {
    if (!m.name.trim() || m.name.length > 200) return `Matériau ${i + 1} : ajoutez un nom (200 caractères maximum).`;
    if (m.quantity.length > 60 || m.notes.length > 1000) return `Matériau ${i + 1} : texte trop long.`;
    if (!money(m.unitCost)) return `Matériau ${i + 1} : le coût est invalide.`;
    if (m.links.length > 10) return `Matériau ${i + 1} : 10 liens au maximum.`;
    for (const l of m.links) {
      if (!https(l.url)) return `Matériau ${i + 1} : chaque lien d’achat doit commencer par https://.`;
      if (l.shop.length > 80 || l.note.length > 200) return `Matériau ${i + 1} : un lien est trop long.`;
    }
  }
  for (const [i, t] of p.tasks.entries()) if (!t.title.trim() || t.title.length > 300) return `Tâche ${i + 1} : ajoutez un titre (300 caractères maximum).`;
  for (const lang of pdfLanguages) { const f = p.pdfs[lang]; if (f && ((!f.url && !f.storageId) || (f.url && !https(f.url)) || f.label.length > 120)) return `PDF ${pdfLanguageLabels[lang]} : fichier ou lien https invalide.`; }
  return null;
}

/** Coût des matières par kit (éléments « Dans le kit » seulement) et marge brute indicative. */
export function costSummary(p: Pick<ProductInput, 'materials' | 'price'>) {
  const kit = p.materials.filter(m => m.purpose === 'kit');
  const cost = kit.reduce((n, m) => n + (m.unitCost ?? 0), 0);
  const missing = kit.filter(m => m.unitCost === null).length;
  const margin = p.price !== null && p.price > 0 ? p.price - cost : null;
  return { cost, missing, margin, marginPercent: margin !== null && p.price ? Math.round(margin / p.price * 100) : null };
}
export const taskProgress = (tasks: { done: boolean }[]) => ({ done: tasks.filter(t => t.done).length, total: tasks.length });
export const euro = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Vrai tant que la checklist est celle de départ : on peut alors la remplacer en changeant de type. */
export const isDefaultChecklist = (tasks: ProductTask[], type: ProductType) =>
  tasks.every(t => !t.done) && tasks.map(t => t.title).join('|') === launchChecklist(type).map(t => t.title).join('|');

/** Copie prête à enregistrer : étapes à refaire, rien d'acheté, sans lien boutique ni leçons reliées.
 *  Les PDF téléversés ne sont pas copiés (un fichier appartient à un seul produit) ; les liens le sont. */
export function duplicateProduct(p: ProductInput): ProductInput {
  const pdfs: ProductInput['pdfs'] = {};
  for (const lang of pdfLanguages) { const f = p.pdfs[lang]; if (f && !f.storageId) pdfs[lang] = { ...f, id: crypto.randomUUID() }; }
  return {
    ...p, title: `${p.title.trim()} (copie)`.slice(0, 200), status: productStatuses[0], shopUrl: '', linkedKitId: '', pdfs,
    contents: p.contents.map(c => ({ ...c, id: crypto.randomUUID() })),
    materials: p.materials.map(m => ({ ...m, id: crypto.randomUUID(), bought: false, links: m.links.map(l => ({ ...l, id: crypto.randomUUID() })) })),
    tasks: p.tasks.map(t => ({ ...t, id: crypto.randomUUID(), done: false })),
  };
}
