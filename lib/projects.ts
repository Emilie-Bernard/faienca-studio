/** Projets de la stagiaire : elle les propose et les fait avancer, l'atelier suit et répond à ses questions. */
import { filesError, type MissionFile } from './stage';

export const projectStatuses = ['idea', 'doing', 'paused', 'done'] as const;
export type ProjectStatus = typeof projectStatuses[number];
export const projectStatusLabels: Record<ProjectStatus, string> = { idea: 'Idée', doing: 'En cours', paused: 'En pause', done: 'Terminé' };

export interface ProjectInput { title: string; description: string }
export interface ProjectQuestion { _id: string; body: string; createdAt: number; answer: string | null; answeredAt: number | null }

/** Nombre de questions encore sans réponse que la stagiaire peut laisser sur un projet. */
export const MAX_OPEN_PROJECT_QUESTIONS = 10;

/** Renvoie un message d'erreur en français, ou null si le projet est valide. */
export function projectError(p: ProjectInput): string | null {
  if (!p.title.trim() || p.title.length > 200) return 'Le titre du projet doit contenir entre 1 et 200 caractères.';
  if (p.description.length > 8000) return 'La description ne peut pas dépasser 8 000 caractères.';
  return null;
}

export const projectFilesError = (files: MissionFile[]) => filesError(files, 'Document');

export function questionError(body: string): string | null {
  const text = body.trim();
  return text.length < 3 || text.length > 2000 ? 'Ta question doit contenir entre 3 et 2 000 caractères.' : null;
}

/** Un projet a du nouveau pour l'atelier s'il a changé depuis sa dernière visite ou attend une réponse. */
export const hasNews = (p: { updatedAt: number; seenByAdminAt: number | null; openQuestions: number }) =>
  p.openQuestions > 0 || p.seenByAdminAt === null || p.updatedAt > p.seenByAdminAt;
