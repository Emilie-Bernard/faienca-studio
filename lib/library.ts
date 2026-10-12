/** Bibliothèque partagée entre l'atelier et les stagiaires : fichiers et liens rangés par catégorie. */
import { filesError, type MissionFile } from './stage';

export interface LibraryInput { title: string; category: string; description: string; file: MissionFile }

/** Renvoie un message d'erreur en français, ou null si le document est valide. */
export function libraryError(d: LibraryInput): string | null {
  if (!d.title.trim() || d.title.length > 120) return 'Le titre doit contenir entre 1 et 120 caractères.';
  if (d.category.length > 60) return 'La catégorie ne peut pas dépasser 60 caractères.';
  if (d.description.length > 2000) return 'La description ne peut pas dépasser 2 000 caractères.';
  return filesError([d.file], 'Document');
}

export const categoryOf = (d: { category: string }) => d.category.trim() || 'Divers';

/** Regroupe par catégorie, dans l'ordre alphabétique ; « Divers » en dernier. */
export function groupByCategory<T extends { category: string }>(items: T[]): { category: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const d of items) { const k = categoryOf(d); groups.set(k, [...(groups.get(k) ?? []), d]); }
  return [...groups].map(([category, list]) => ({ category, items: list }))
    .sort((a, b) => (a.category === 'Divers' ? 1 : 0) - (b.category === 'Divers' ? 1 : 0) || a.category.localeCompare(b.category, 'fr'));
}
