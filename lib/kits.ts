export const roles = ['admin', 'cliente', 'stagiaire'] as const;
export type Role = typeof roles[number];

/** Langues de traduction du contenu des kits ; le français est la langue d'origine. */
export const kitLanguages = ['en', 'es'] as const;
export type KitLanguage = typeof kitLanguages[number];
export type Translations<T> = Partial<Record<KitLanguage, T>>;
export type LessonText = { title: string; stitch: string; notes: string };
export type KitText = { title: string; description: string };

export interface Lesson { id: string; title: string; stitch: string; videoUrl: string; videoStorageId?: string; notes: string; translations?: Translations<LessonText> }
export interface KitInput { title: string; description: string; coverUrl: string; accessCode: string; published: boolean; lessons: Lesson[]; translations?: Translations<KitText> }

/** Remplace chaque champ par sa traduction quand elle existe ; un champ vide reprend le français. */
export function localized<T extends Record<string, string>>(base: T, translations: Translations<T> | undefined, language: string): T {
  const t = (kitLanguages as readonly string[]).includes(language) ? translations?.[language as KitLanguage] : undefined;
  if (!t) return base;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, t[k]?.trim() ? t[k] : v])) as T;
}
export const localizeLesson = <L extends Lesson>(l: L, language: string): L => ({ ...l, ...localized({ title: l.title, stitch: l.stitch, notes: l.notes }, l.translations, language) });
export const localizeKit = <K extends KitText & { translations?: Translations<KitText> }>(k: K, language: string): K => ({ ...k, ...localized({ title: k.title, description: k.description }, k.translations, language) });

export const emptyKit = (): KitInput => ({ title: '', description: '', coverUrl: '', accessCode: '', published: false, lessons: [] });
export const newLesson = (): Lesson => ({ id: crypto.randomUUID(), title: '', stitch: '', videoUrl: '', notes: '' });

/** Renvoie un message d'erreur en français, ou null si le kit est valide. */
export function kitError(k: KitInput): string | null {
  if (!k.title.trim() || k.title.length > 200) return 'Le titre du kit doit contenir entre 1 et 200 caractères.';
  if (k.description.length > 5000) return 'La description ne peut pas dépasser 5 000 caractères.';
  if (k.coverUrl && !/^https:\/\//i.test(k.coverUrl)) return 'L’image de couverture doit commencer par https://.';
  if (k.accessCode.length > 60) return 'Le code d’activation ne peut pas dépasser 60 caractères.';
  if (k.lessons.length > 80) return 'Un kit contient au maximum 80 leçons.';
  if (new Set(k.lessons.map(l => l.id)).size !== k.lessons.length) return 'Identifiants de leçons dupliqués.';
  for (const [i, l] of k.lessons.entries()) {
    if (!l.title.trim() || l.title.length > 200) return `La leçon ${i + 1} doit avoir un titre (200 caractères maximum).`;
    if (l.stitch.length > 120 || l.notes.length > 5000) return `La leçon ${i + 1} est trop longue.`;
    if (l.videoUrl && !/^https:\/\//i.test(l.videoUrl)) return `La vidéo de la leçon ${i + 1} doit être un lien https://.`;
    for (const t of Object.values(l.translations ?? {})) if (t && (t.title.length > 200 || t.stitch.length > 120 || t.notes.length > 5000)) return `Une traduction de la leçon ${i + 1} est trop longue.`;
  }
  for (const t of Object.values(k.translations ?? {})) if (t && (t.title.length > 200 || t.description.length > 5000)) return 'Une traduction du titre ou de la description est trop longue.';
  return null;
}

/** Normalise un code d'activation : la casse, les espaces et les tirets ne comptent pas. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]+/g, '');

export type VideoSource = { type: 'iframe', src: string } | { type: 'video', src: string };

/** Convertit un lien YouTube, Vimeo ou fichier vidéo en source lisible dans la page. */
export function videoSource(url: string): VideoSource | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') { const id = u.pathname.slice(1).split('/')[0]; return id ? { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null; }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
    return id ? { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const [id, hash] = u.pathname.replace(/^\/video\//, '/').split('/').filter(Boolean);
    if (!id || !/^\d+$/.test(id)) return null;
    const h = u.searchParams.get('h') ?? (hash && /^[\da-f]+$/i.test(hash) ? hash : null);
    return { type: 'iframe', src: `https://player.vimeo.com/video/${id}${h ? '?h=' + h : ''}` };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'video', src: u.toString() };
  return null;
}

export const progressPercent = (done: number, total: number) => total ? Math.round(done / total * 100) : 0;
