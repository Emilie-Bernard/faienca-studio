/** Veille textile : portraits de brodeuses et d'artistes textiles, et nouvelles du monde de la broderie. */

export const zones = ['france', 'europe', 'monde'] as const;
export type Zone = typeof zones[number];
export const zoneLabels: Record<Zone, string> = { france: 'France', europe: 'Europe', monde: 'Monde' };

export const timelineKinds = ['vie', 'formation', 'oeuvre', 'exposition', 'residence', 'prix', 'autre'] as const;
export type TimelineKind = typeof timelineKinds[number];
export const timelineLabels: Record<TimelineKind, string> = { vie: 'Vie', formation: 'Formation', oeuvre: 'Œuvre', exposition: 'Exposition', residence: 'Résidence, voyage', prix: 'Prix', autre: 'Autre' };

export const newsKinds = ['exposition', 'actualite', 'technique', 'salon'] as const;
export type NewsKind = typeof newsKinds[number];
export const newsLabels: Record<NewsKind, string> = { exposition: 'Exposition', actualite: 'Actualité', technique: 'Technique', salon: 'Salon, festival' };

export type Link = { label: string; url: string };
export type Work = { id: string; title: string; year: string; technique: string; description: string; url: string; imageUrl: string };
export type TimelineItem = { id: string; date: string; kind: TimelineKind; label: string };

/** Ce que l'on sait d'une artiste. Les dates sont « AAAA », « AAAA-MM » ou « AAAA-MM-JJ ». */
export interface PortraitInput {
  name: string; country: string; city: string; zone: Zone;
  birthDate: string; deathDate: string;
  techniques: string[]; summary: string; biography: string;
  website: string; instagram: string; photoUrl: string;
  works: Work[]; timeline: TimelineItem[]; sources: Link[];
  researchNotes: string;
}

export interface NewsInput {
  kind: NewsKind; title: string; summary: string;
  place: string; city: string; country: string; zone: Zone;
  startDate: string; endDate: string; url: string;
}

export const emptyPortrait = (name = ''): PortraitInput => ({
  name, country: '', city: '', zone: 'france', birthDate: '', deathDate: '',
  techniques: [], summary: '', biography: '', website: '', instagram: '', photoUrl: '',
  works: [], timeline: [], sources: [], researchNotes: '',
});

export const emptyNews = (): NewsInput => ({ kind: 'exposition', title: '', summary: '', place: '', city: '', country: 'France', zone: 'france', startDate: '', endDate: '', url: '' });

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const isDate = (s: string) => !s || DATE.test(s);
const isLink = (s: string) => !s || /^https:\/\/\S+$/i.test(s);

/** Renvoie un message d'erreur en français, ou null si le portrait est valide. */
export function portraitError(p: PortraitInput): string | null {
  if (!p.name.trim() || p.name.length > 120) return 'Le nom doit contenir entre 1 et 120 caractères.';
  if (!zones.includes(p.zone)) return 'La zone doit être France, Europe ou Monde.';
  if (!isDate(p.birthDate) || !isDate(p.deathDate)) return 'Les dates de naissance et de décès s’écrivent AAAA, AAAA-MM ou AAAA-MM-JJ.';
  if (p.summary.length > 600) return 'Le résumé ne peut pas dépasser 600 caractères.';
  if (p.biography.length > 20000) return 'La biographie ne peut pas dépasser 20 000 caractères.';
  if (p.techniques.length > 30) return '30 techniques au maximum.';
  if (p.works.length > 200 || p.timeline.length > 300 || p.sources.length > 100) return 'Trop d’éléments dans ce portrait.';
  for (const u of [p.website, p.instagram, p.photoUrl]) if (!isLink(u)) return 'Les liens doivent commencer par https://.';
  for (const w of p.works) {
    if (!w.title.trim()) return 'Chaque œuvre a besoin d’un titre.';
    if (!isLink(w.url) || !isLink(w.imageUrl)) return `Œuvre « ${w.title} » : les liens doivent commencer par https://.`;
  }
  for (const t of p.timeline) {
    if (!t.label.trim()) return 'Chaque date de la frise a besoin d’un libellé.';
    if (!t.date || !DATE.test(t.date)) return `« ${t.label} » : la date s’écrit AAAA, AAAA-MM ou AAAA-MM-JJ.`;
    if (!timelineKinds.includes(t.kind)) return `« ${t.label} » : type de date inconnu.`;
  }
  for (const s of p.sources) if (!s.url || !isLink(s.url)) return 'Chaque source doit être un lien https://.';
  return null;
}

export function newsError(n: NewsInput): string | null {
  if (!n.title.trim() || n.title.length > 200) return 'Le titre doit contenir entre 1 et 200 caractères.';
  if (!newsKinds.includes(n.kind)) return 'Type de nouvelle inconnu.';
  if (!zones.includes(n.zone)) return 'La zone doit être France, Europe ou Monde.';
  if (n.summary.length > 4000) return 'Le résumé ne peut pas dépasser 4 000 caractères.';
  if (!isDate(n.startDate) || !isDate(n.endDate)) return 'Les dates s’écrivent AAAA, AAAA-MM ou AAAA-MM-JJ.';
  if (n.startDate && n.endDate && n.endDate < n.startDate) return 'La date de fin est avant la date de début.';
  if (!isLink(n.url)) return 'Le lien doit commencer par https://.';
  return null;
}

/** Clé de comparaison d'un nom : sans accents, sans casse, espaces réduits. */
export const nameKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 1975 », « mars 1975 » ou « 12 mars 1975 ». */
export function dateFr(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  if (!m) return y!;
  const month = months[Number(m) - 1] ?? m;
  return day ? `${Number(day)} ${month} ${y}` : `${month} ${y}`;
}

/** « née en 1975 », « 1902 – 1980 », ou rien si les dates sont inconnues. */
export function lifeDates(p: { birthDate: string; deathDate: string }): string {
  if (p.birthDate && p.deathDate) return `${dateFr(p.birthDate)} – ${dateFr(p.deathDate)}`;
  if (p.birthDate) return `née en ${dateFr(p.birthDate)}`;
  if (p.deathDate) return `morte en ${dateFr(p.deathDate)}`;
  return '';
}

/** Frise du plus ancien au plus récent ; à date égale, l'ordre d'origine. */
export const sortTimeline = <T extends { date: string }>(items: T[]) => items.map((t, i) => ({ t, i })).sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i).map(x => x.t);

/** Une nouvelle est « à venir » ou « en cours » tant que sa date de fin (ou de début) n'est pas passée. */
export function newsWhen(n: { startDate: string; endDate: string }, today: string): 'past' | 'current' | 'upcoming' | 'undated' {
  const start = n.startDate, end = n.endDate || n.startDate;
  if (!start) return 'undated';
  if (end.length >= 10 ? end < today : end < today.slice(0, end.length)) return 'past';
  if (start.length >= 10 ? start > today : start > today.slice(0, start.length)) return 'upcoming';
  return 'current';
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const date = (v: unknown) => { const s = str(v, 10); return DATE.test(s) ? s : ''; };
const link = (v: unknown) => { const s = str(v, 2000); return /^https:\/\/\S+$/i.test(s) ? s : ''; };
const zone = (v: unknown, country = ''): Zone => {
  if (zones.includes(v as Zone)) return v as Zone;
  return nameKey(country) === 'france' ? 'france' : 'monde';
};
const arr = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : [];

/**
 * Met en forme ce que renvoie l'agent de recherche (ou un import JSON) :
 * tout champ absent, mal formé ou trop long est corrigé plutôt que de faire échouer l'enregistrement.
 */
export function normalizePortrait(raw: unknown, newId: () => string): PortraitInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const country = str(r.country, 80);
  const seenSources = new Set<string>();
  return {
    name: str(r.name, 120), country, city: str(r.city, 80), zone: zone(r.zone, country),
    birthDate: date(r.birthDate), deathDate: date(r.deathDate),
    techniques: [...new Set((Array.isArray(r.techniques) ? r.techniques : []).map(t => str(t, 80)).filter(Boolean))].slice(0, 30),
    summary: str(r.summary, 600), biography: str(r.biography, 20000),
    website: link(r.website), instagram: link(r.instagram), photoUrl: link(r.photoUrl),
    works: arr(r.works).map(w => ({ id: newId(), title: str(w.title, 200), year: str(w.year, 20), technique: str(w.technique, 200), description: str(w.description, 2000), url: link(w.url), imageUrl: link(w.imageUrl) })).filter(w => w.title).slice(0, 200),
    timeline: sortTimeline(arr(r.timeline).map(t => ({ id: newId(), date: date(t.date), kind: (timelineKinds.includes(t.kind as TimelineKind) ? t.kind : 'autre') as TimelineKind, label: str(t.label, 300) })).filter(t => t.date && t.label)).slice(0, 300),
    sources: arr(r.sources).map(s => ({ label: str(s.label, 200), url: link(s.url) })).filter(s => s.url && !seenSources.has(s.url) && seenSources.add(s.url)).slice(0, 100),
    researchNotes: str(r.researchNotes, 4000),
  };
}

export function normalizeNews(raw: unknown): NewsInput | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const country = str(r.country, 80);
  const n: NewsInput = {
    kind: (newsKinds.includes(r.kind as NewsKind) ? r.kind : 'actualite') as NewsKind,
    title: str(r.title, 200), summary: str(r.summary, 4000),
    place: str(r.place, 200), city: str(r.city, 80), country, zone: zone(r.zone, country),
    startDate: date(r.startDate), endDate: date(r.endDate), url: link(r.url),
  };
  if (n.startDate && n.endDate < n.startDate) n.endDate = '';
  return n.title ? n : null;
}

/**
 * Ajoute au portrait ce que l'agent vient de trouver : les champs trouvés remplacent les anciens,
 * les œuvres, dates et sources s'ajoutent sans doublon, pour garder ce qui a été saisi à la main.
 */
export function mergePortrait(current: PortraitInput, found: PortraitInput): PortraitInput {
  const pick = (a: string, b: string) => b || a;
  const byKey = <T>(list: T[], key: (x: T) => string) => { const seen = new Set<string>(); return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  return {
    name: current.name || found.name,
    country: pick(current.country, found.country), city: pick(current.city, found.city),
    zone: found.country ? found.zone : current.zone,
    birthDate: pick(current.birthDate, found.birthDate), deathDate: pick(current.deathDate, found.deathDate),
    techniques: byKey([...current.techniques, ...found.techniques], nameKey).slice(0, 30),
    summary: pick(current.summary, found.summary), biography: pick(current.biography, found.biography),
    website: pick(current.website, found.website), instagram: pick(current.instagram, found.instagram), photoUrl: pick(current.photoUrl, found.photoUrl),
    works: byKey([...current.works, ...found.works], w => nameKey(w.title)).slice(0, 200),
    timeline: sortTimeline(byKey([...current.timeline, ...found.timeline], t => t.date + ' ' + nameKey(t.label))).slice(0, 300),
    sources: byKey([...current.sources, ...found.sources], s => s.url).slice(0, 100),
    researchNotes: pick(current.researchNotes, found.researchNotes),
  };
}

/** Les artistes du carnet dont le nom apparaît dans le texte d'une nouvelle. */
export function mentionedArtists<T extends { nameKey: string }>(artists: T[], text: string): T[] {
  const hay = ' ' + nameKey(text) + ' ';
  return artists.filter(a => a.nameKey.includes(' ') && hay.includes(' ' + a.nameKey + ' '));
}

/** Coût d'une recherche en dollars (facturé par OpenRouter) : « 0,034 $ », « 1,20 $ ». */
export function dollars(n: number): string {
  const digits = n > 0 && n < 0.1 ? 3 : 2;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' $';
}

// --- Ateliers de broderie d'art ---

export type Person = { name: string; role: string };

/** Un atelier ou une maison de broderie d'art : qui l'a fondé, qui y travaille, son histoire. */
export interface WorkshopInput {
  name: string; city: string; region: string; country: string;
  foundedDate: string; closedDate: string;
  founders: string[]; people: Person[];
  techniques: string[]; clients: string[]; labels: string[];
  summary: string; history: string; training: string;
  website: string; instagram: string; photoUrl: string;
  /** Réalisations de l'atelier, avec leur image : « year » sert aussi à nommer la maison cliente dans « technique ». */
  works: Work[];
  timeline: TimelineItem[]; sources: Link[]; researchNotes: string;
}

export const emptyWorkshop = (name = ''): WorkshopInput => ({
  name, city: '', region: '', country: 'France', foundedDate: '', closedDate: '',
  founders: [], people: [], techniques: [], clients: [], labels: [],
  summary: '', history: '', training: '', website: '', instagram: '', photoUrl: '',
  works: [], timeline: [], sources: [], researchNotes: '',
});

export function workshopError(w: WorkshopInput): string | null {
  if (!w.name.trim() || w.name.length > 160) return 'Le nom doit contenir entre 1 et 160 caractères.';
  if (!isDate(w.foundedDate) || !isDate(w.closedDate)) return 'Les dates de création et de fermeture s’écrivent AAAA, AAAA-MM ou AAAA-MM-JJ.';
  if (w.summary.length > 600) return 'Le résumé ne peut pas dépasser 600 caractères.';
  if (w.history.length > 20000) return 'L’histoire ne peut pas dépasser 20 000 caractères.';
  if (w.training.length > 2000) return 'Les formations ne peuvent pas dépasser 2 000 caractères.';
  if (w.people.length > 100 || w.founders.length > 30 || w.clients.length > 100 || w.labels.length > 30 || w.techniques.length > 30) return 'Trop d’éléments dans cette fiche.';
  if (w.timeline.length > 300 || w.sources.length > 100 || w.works.length > 200) return 'Trop d’éléments dans cette fiche.';
  for (const x of w.works) {
    if (!x.title.trim()) return 'Chaque réalisation a besoin d’un titre.';
    if (!isLink(x.url) || !isLink(x.imageUrl)) return `Réalisation « ${x.title} » : les liens doivent commencer par https://.`;
  }
  for (const u of [w.website, w.instagram, w.photoUrl]) if (!isLink(u)) return 'Les liens doivent commencer par https://.';
  for (const p of w.people) if (!p.name.trim()) return 'Chaque personne a besoin d’un nom.';
  for (const t of w.timeline) {
    if (!t.label.trim()) return 'Chaque date de la frise a besoin d’un libellé.';
    if (!t.date || !DATE.test(t.date)) return `« ${t.label} » : la date s’écrit AAAA, AAAA-MM ou AAAA-MM-JJ.`;
    if (!timelineKinds.includes(t.kind)) return `« ${t.label} » : type de date inconnu.`;
  }
  for (const s of w.sources) if (!s.url || !isLink(s.url)) return 'Chaque source doit être un lien https://.';
  return null;
}

const strings = (v: unknown, max: number, count: number) => [...new Set((Array.isArray(v) ? v : []).map(t => str(t, max)).filter(Boolean))].slice(0, count);

export function normalizeWorkshop(raw: unknown, newId: () => string): WorkshopInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seenSources = new Set<string>(), seenPeople = new Set<string>();
  return {
    name: str(r.name, 160), city: str(r.city, 80), region: str(r.region, 80), country: str(r.country, 80) || 'France',
    foundedDate: date(r.foundedDate), closedDate: date(r.closedDate),
    founders: strings(r.founders, 120, 30),
    people: arr(r.people).map(p => ({ name: str(p.name, 120), role: str(p.role, 200) })).filter(p => p.name && !seenPeople.has(nameKey(p.name)) && seenPeople.add(nameKey(p.name))).slice(0, 100),
    techniques: strings(r.techniques, 80, 30), clients: strings(r.clients, 120, 100), labels: strings(r.labels, 160, 30),
    summary: str(r.summary, 600), history: str(r.history, 20000), training: str(r.training, 2000),
    website: link(r.website), instagram: link(r.instagram), photoUrl: link(r.photoUrl),
    works: arr(r.works).map(w => ({ id: newId(), title: str(w.title, 200), year: str(w.year, 20), technique: str(w.technique, 200), description: str(w.description, 2000), url: link(w.url), imageUrl: link(w.imageUrl) })).filter(w => w.title).slice(0, 200),
    timeline: sortTimeline(arr(r.timeline).map(t => ({ id: newId(), date: date(t.date), kind: (timelineKinds.includes(t.kind as TimelineKind) ? t.kind : 'autre') as TimelineKind, label: str(t.label, 300) })).filter(t => t.date && t.label)).slice(0, 300),
    sources: arr(r.sources).map(s => ({ label: str(s.label, 200), url: link(s.url) })).filter(s => s.url && !seenSources.has(s.url) && seenSources.add(s.url)).slice(0, 100),
    researchNotes: str(r.researchNotes, 4000),
  };
}

/** Comme pour les portraits : ce qui est trouvé complète la fiche sans effacer ce qui a été saisi à la main. */
export function mergeWorkshop(current: WorkshopInput, found: WorkshopInput): WorkshopInput {
  const pick = (a: string, b: string) => b || a;
  const union = (a: string[], b: string[], max: number) => { const seen = new Set<string>(); return [...a, ...b].filter(x => { const k = nameKey(x); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max); };
  const seen = new Set<string>();
  return {
    name: current.name || found.name, city: pick(current.city, found.city), region: pick(current.region, found.region), country: pick(current.country, found.country),
    foundedDate: pick(current.foundedDate, found.foundedDate), closedDate: pick(current.closedDate, found.closedDate),
    founders: union(current.founders, found.founders, 30),
    people: [...current.people, ...found.people].filter(p => { const k = nameKey(p.name); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 100),
    techniques: union(current.techniques, found.techniques, 30), clients: union(current.clients, found.clients, 100), labels: union(current.labels, found.labels, 30),
    summary: pick(current.summary, found.summary), history: pick(current.history, found.history), training: pick(current.training, found.training),
    website: pick(current.website, found.website), instagram: pick(current.instagram, found.instagram), photoUrl: pick(current.photoUrl, found.photoUrl),
    // Une réalisation trouvée complète celle du même titre (l'image surtout) au lieu d'être ignorée.
    works: [...current.works.map(w => { const f = found.works.find(x => nameKey(x.title) === nameKey(w.title)); return f ? { ...w, year: w.year || f.year, technique: w.technique || f.technique, description: w.description || f.description, url: w.url || f.url, imageUrl: w.imageUrl || f.imageUrl } : w; }),
      ...found.works.filter(f => !current.works.some(w => nameKey(w.title) === nameKey(f.title)))].slice(0, 200),
    timeline: mergePortrait({ ...emptyPortrait(), timeline: current.timeline }, { ...emptyPortrait(), timeline: found.timeline }).timeline,
    sources: mergePortrait({ ...emptyPortrait(), sources: current.sources }, { ...emptyPortrait(), sources: found.sources }).sources,
    researchNotes: pick(current.researchNotes, found.researchNotes),
  };
}

// --- Documentaires et vidéos ---

export const videoKinds = ['documentaire', 'reportage', 'demonstration', 'cours', 'conference'] as const;
export type VideoKind = typeof videoKinds[number];
export const videoKindLabels: Record<VideoKind, string> = { documentaire: 'Documentaire', reportage: 'Reportage', demonstration: 'Démonstration', cours: 'Cours', conference: 'Conférence' };
export const platforms = ['youtube', 'arte', 'francetv', 'ina', 'vimeo', 'autre'] as const;
export type Platform = typeof platforms[number];
export const platformLabels: Record<Platform, string> = { youtube: 'YouTube', arte: 'Arte', francetv: 'France TV', ina: 'INA', vimeo: 'Vimeo', autre: 'Autre' };

export interface VideoInput {
  title: string; url: string; platform: Platform; language: 'fr' | 'en'; kind: VideoKind;
  channel: string; year: string; duration: string; summary: string;
  techniques: string[]; people: string[]; forCap: boolean; availableUntil: string;
}

export const emptyVideo = (): VideoInput => ({ title: '', url: '', platform: 'youtube', language: 'fr', kind: 'documentaire', channel: '', year: '', duration: '', summary: '', techniques: [], people: [], forCap: false, availableUntil: '' });

export function videoError(v: VideoInput): string | null {
  if (!v.title.trim() || v.title.length > 200) return 'Le titre doit contenir entre 1 et 200 caractères.';
  if (!v.url || !isLink(v.url)) return 'La vidéo a besoin d’un lien https://.';
  if (!platforms.includes(v.platform) || !videoKinds.includes(v.kind) || (v.language !== 'fr' && v.language !== 'en')) return 'Plateforme, type ou langue inconnus.';
  if (v.year && !/^\d{4}$/.test(v.year)) return 'L’année s’écrit AAAA.';
  if (!isDate(v.availableUntil)) return 'La date de disponibilité s’écrit AAAA-MM-JJ.';
  if (v.summary.length > 2000) return 'Le résumé ne peut pas dépasser 2 000 caractères.';
  if (v.techniques.length > 30 || v.people.length > 50) return 'Trop d’éléments dans cette fiche.';
  return null;
}

/** La plateforme se déduit du lien quand elle n'est pas donnée. */
export function platformOf(url: string): Platform {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'youtube';
  if (/(^|\.)arte\.tv$/.test(host)) return 'arte';
  if (/(^|\.)france\.tv$|(^|\.)francetvinfo\.fr$|(^|\.)france3-regions\./.test(host)) return 'francetv';
  if (/(^|\.)ina\.fr$/.test(host)) return 'ina';
  if (/(^|\.)vimeo\.com$/.test(host)) return 'vimeo';
  return 'autre';
}

/** Identifiant d'une vidéo YouTube (pour sa vignette), ou null. */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1]! : null;
}

export function normalizeVideo(raw: unknown): VideoInput | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const url = link(r.url);
  const year = str(r.year, 4);
  const v: VideoInput = {
    title: str(r.title, 200), url,
    platform: platforms.includes(r.platform as Platform) ? r.platform as Platform : platformOf(url),
    language: r.language === 'en' ? 'en' : 'fr',
    kind: videoKinds.includes(r.kind as VideoKind) ? r.kind as VideoKind : 'reportage',
    channel: str(r.channel, 120), year: /^\d{4}$/.test(year) ? year : '', duration: str(r.duration, 30), summary: str(r.summary, 2000),
    techniques: strings(r.techniques, 80, 30), people: strings(r.people, 120, 50),
    forCap: r.forCap === true, availableUntil: date(r.availableUntil),
  };
  return v.title && v.url ? v : null;
}

/** Étiquette courte pour une carte : « Entreprise du Patrimoine Vivant (2008, selon son site) » devient « EPV ». */
export function shortTag(t: string): string {
  if (/patrimoine vivant/i.test(t)) return 'EPV';
  if (/meilleur ouvrier/i.test(t)) return 'MOF';
  if (/ma[iî]tre d.art/i.test(t)) return 'Maître d’art';
  const s = t.replace(/\s*\([^)]*\)/g, '').split(/\s*[:;]\s/)[0]!.trim();
  return s.length > 32 ? s.slice(0, 30).trimEnd() + '…' : s;
}

/** Les étiquettes d'une carte : labels connus d'abord (EPV, MOF…), puis techniques, sans doublon. */
export function cardTags(labels: string[], techniques: string[], max = 3): string[] {
  const known = labels.map(shortTag).filter(t => ['EPV', 'MOF', 'Maître d’art'].includes(t));
  return [...new Set([...known, ...techniques.map(shortTag)])].filter(Boolean).slice(0, max);
}
