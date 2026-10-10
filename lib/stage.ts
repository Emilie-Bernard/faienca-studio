/** Missions du stage : l'atelier les prépare, la stagiaire les suit à son rythme. */
export const missionStatuses = ['todo', 'doing', 'submitted', 'validated'] as const;
export type MissionStatus = typeof missionStatuses[number];
export const missionStatusLabels: Record<MissionStatus, string> = { todo: 'À faire', doing: 'En cours', submitted: 'À relire', validated: 'Validée' };
/** Statuts que la stagiaire choisit elle-même ; « Validée » revient à l'atelier. */
export const traineeStatuses = ['todo', 'doing', 'submitted'] as const satisfies readonly MissionStatus[];

export interface MissionFile { id: string; label: string; url: string; storageId?: string }
export interface MissionInput { title: string; description: string; phase: string; dueDate: string; published: boolean; resources: MissionFile[] }

export const emptyMission = (): MissionInput => ({ title: '', description: '', phase: '', dueDate: '', published: false, resources: [] });
export const newFile = (): MissionFile => ({ id: crypto.randomUUID(), label: '', url: '' });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s).toISOString().slice(0, 10) === s;

/** Valide une liste de fichiers ou de liens (ressources d'une mission, rendus de la stagiaire). */
export function filesError(files: MissionFile[], what: string): string | null {
  if (files.length > 20) return `${what} : 20 éléments au maximum.`;
  if (new Set(files.map(f => f.id)).size !== files.length) return `${what} : identifiants dupliqués.`;
  for (const [i, f] of files.entries()) {
    if (f.label.length > 120) return `${what} ${i + 1} : le nom est trop long (120 caractères maximum).`;
    if (!f.url && !f.storageId) return `${what} ${i + 1} : ajoutez un fichier ou un lien.`;
    if (f.url && !/^https:\/\//i.test(f.url)) return `${what} ${i + 1} : le lien doit commencer par https://.`;
  }
  return null;
}

/** Renvoie un message d'erreur en français, ou null si la mission est valide. */
export function missionError(m: MissionInput): string | null {
  if (!m.title.trim() || m.title.length > 200) return 'Le titre de la mission doit contenir entre 1 et 200 caractères.';
  if (m.description.length > 8000) return 'La description ne peut pas dépasser 8 000 caractères.';
  if (m.phase.length > 80) return 'Le nom de la phase ne peut pas dépasser 80 caractères.';
  if (m.dueDate && !isDate(m.dueDate)) return 'La date repère est invalide.';
  return filesError(m.resources, 'Ressource');
}

export const phaseOf = (m: { phase: string }) => m.phase.trim() || 'Sans phase';

/** Regroupe les missions par phase, dans l'ordre où elles apparaissent. */
export function groupByPhase<T extends { phase: string }>(missions: T[]): { phase: string; missions: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const m of missions) { const k = phaseOf(m); groups.set(k, [...(groups.get(k) ?? []), m]); }
  return [...groups].map(([phase, list]) => ({ phase, missions: list }));
}

export const percentDone = (statuses: MissionStatus[]) =>
  statuses.length ? Math.round(statuses.filter(s => s === 'validated' || s === 'submitted').length / statuses.length * 100) : 0;
