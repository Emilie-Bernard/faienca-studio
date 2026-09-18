export const contentStatuses = ['À préparer', 'En production', 'Programmé', 'Publié', 'À recycler'] as const;
export const projectStatuses = ['À envisager', 'À faire', 'En cours', 'Bloqué', 'Terminé'] as const;
export const stages = ['Astuce', 'Participation', 'Projet complet', 'Offre'] as const;
export const certainties = ['Hypothèse', 'À tester', 'Validé'] as const;
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
export function emptyEntry(kind: Kind): EntryInput {
  return {
    kind, title: '', text: '', status: kind === 'publication' ? 'À préparer' : kind === 'projet' ? 'À faire' : 'Hypothèse',
    date: '', channel: 'Instagram', format: 'Reel', objective: '', hook: '', cta: '', stories: '', offer: '', projectId: '', stage: 'Astuce', priority: 'Normale', category: 'Cible', tasks: [], url: '', caveat: '', original: '', reach: null, saves: null, shares: null, clicks: null, orders: null,
  };
}
export function isoToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function dateLabel(date: string) { return date ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Sans échéance'; }
export const calendarCsvFields = ['date', 'title', 'channel', 'format', 'status', 'stage', 'objective', 'hook', 'text', 'cta', 'stories', 'offer', 'projectId', 'url', 'caveat', 'reach', 'saves', 'shares', 'clicks', 'orders'] as const;
export type CalendarCsvField = typeof calendarCsvFields[number];
export function csvEscape(value: unknown) { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }
export function calendarCsv(entries: Entry[]) {
  return '\uFEFF' + [calendarCsvFields.join(';'), ...entries.filter(e => e.kind === 'publication').sort((a, b) => a.date.localeCompare(b.date)).map(e => calendarCsvFields.map(k => csvEscape(e[k])).join(';'))].join('\r\n');
}
const csvHeaderAliases: Record<string, CalendarCsvField> = {
  date: 'date', title: 'title', titre: 'title', channel: 'channel', canal: 'channel', format: 'format', status: 'status', statut: 'status',
  stage: 'stage', etape: 'stage', etapeduparcours: 'stage', objective: 'objective', objectif: 'objective', hook: 'hook', accroche: 'hook',
  text: 'text', texte: 'text', textederoule: 'text', cta: 'cta', appelalaction: 'cta', stories: 'stories', storiesassociees: 'stories',
  offer: 'offer', offre: 'offer', offreasociee: 'offer', projectid: 'projectId', projet: 'projectId', projetassocie: 'projectId', project: 'projectId',
  url: 'url', lien: 'url', lienpublie: 'url', caveat: 'caveat', averifier: 'caveat', averifieravantpublication: 'caveat',
  reach: 'reach', portee: 'reach', saves: 'saves', enregistrements: 'saves', shares: 'shares', partages: 'shares',
  clicks: 'clicks', clics: 'clicks', orders: 'orders', commandes: 'orders',
};
function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '');
}
function unescapeCsvValue(value: string) {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
function countUnquoted(line: string, char: string) {
  let n = 0, quotes = false;
  for (const c of line) {
    if (c === '"') quotes = !quotes;
    else if (!quotes && c === char) n++;
  }
  return n;
}
function parseCsvTable(text: string) {
  const src = text.replace(/^\uFEFF/, '');
  if (!src.trim()) return [] as string[][];
  const firstLine = src.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const delimiter = countUnquoted(firstLine, ';') >= countUnquoted(firstLine, ',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', i = 0, inQuotes = false;
  const pushRow = () => { if (row.some(cell => cell.trim())) rows.push(row); row = []; };
  while (i < src.length) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = ''; pushRow(); i++; continue;
    }
    field += c; i++;
  }
  row.push(field); pushRow();
  return rows;
}
function parseCsvDate(raw: string, line: number) {
  const value = raw.trim();
  if (!value) return '';
  let iso = value;
  const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (fr) {
    const year = fr[3]!.length === 2 ? (Number(fr[3]) >= 70 ? '19' : '20') + fr[3] : fr[3]!;
    iso = `${year}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) {
    throw new Error(`Date invalide à la ligne ${line}. Utilisez AAAA-MM-JJ.`);
  }
  return iso;
}
function parseCsvMetric(raw: string, line: number, label: string) {
  const value = raw.trim();
  if (!value) return null;
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`« ${label} » invalide à la ligne ${line}.`);
  return n;
}
function pickCsv(row: Partial<Record<CalendarCsvField, string>>, field: CalendarCsvField) {
  return unescapeCsvValue(row[field] ?? '').trim();
}
export function parseCalendarCsv(text: string, projects: { _id: string; title: string }[]) {
  const table = parseCsvTable(text);
  if (!table.length) throw new Error('Ce fichier CSV est vide.');
  const header = table[0]!.map(normalizeCsvHeader);
  const mapped = header.map(cell => csvHeaderAliases[cell]);
  const hasHeaders = mapped.some(Boolean);
  const columns: (CalendarCsvField | undefined)[] = hasHeaders ? mapped : calendarCsvFields.map((field, i) => header[i] === undefined ? undefined : field);
  const dataRows = hasHeaders ? table.slice(1) : table;
  if (hasHeaders && !columns.includes('title')) throw new Error('Ajoutez une colonne Titre, comme dans l’export CSV du calendrier.');
  if (dataRows.length > 200) throw new Error('Limitez l’import à 200 contenus à la fois.');
  const entries = dataRows.flatMap((cells, index) => {
    const line = index + (hasHeaders ? 2 : 1);
    const row: Partial<Record<CalendarCsvField, string>> = {};
    columns.forEach((field, i) => { if (field) row[field] = cells[i] ?? ''; });
    if (columns.every((field, i) => !unescapeCsvValue(cells[i] ?? '').trim())) return [];
    const title = pickCsv(row, 'title');
    if (!title) throw new Error(`Le titre est obligatoire à la ligne ${line}.`);
    if (title.length > 200) throw new Error(`Le titre dépasse 200 caractères à la ligne ${line}.`);
    const status = pickCsv(row, 'status') || 'À préparer';
    if (!(contentStatuses as readonly string[]).includes(status)) throw new Error(`Statut « ${status} » inconnu à la ligne ${line}.`);
    const stage = pickCsv(row, 'stage') || 'Astuce';
    if (!(stages as readonly string[]).includes(stage)) throw new Error(`Étape « ${stage} » inconnue à la ligne ${line}.`);
    const url = pickCsv(row, 'url');
    if (url && !/^https?:\/\//i.test(url)) throw new Error(`Le lien doit commencer par https:// ou http:// (ligne ${line}).`);
    const projectValue = pickCsv(row, 'projectId');
    let projectId = '';
    if (projectValue) {
      const byId = projects.find(p => p._id === projectValue);
      const byTitle = projects.filter(p => p.title.toLowerCase() === projectValue.toLowerCase());
      if (byId) projectId = byId._id;
      else if (byTitle.length === 1) projectId = byTitle[0]!._id;
      else throw new Error(`Projet « ${projectValue} » introuvable à la ligne ${line}.`);
    }
    return [{
      ...emptyEntry('publication'),
      title,
      date: parseCsvDate(pickCsv(row, 'date'), line),
      channel: pickCsv(row, 'channel') || 'Instagram',
      format: pickCsv(row, 'format') || 'Reel',
      status,
      stage,
      objective: pickCsv(row, 'objective'),
      hook: pickCsv(row, 'hook'),
      text: pickCsv(row, 'text'),
      cta: pickCsv(row, 'cta'),
      stories: pickCsv(row, 'stories'),
      offer: pickCsv(row, 'offer'),
      projectId,
      url,
      caveat: pickCsv(row, 'caveat'),
      reach: parseCsvMetric(pickCsv(row, 'reach'), line, 'Portée'),
      saves: parseCsvMetric(pickCsv(row, 'saves'), line, 'Enregistrements'),
      shares: parseCsvMetric(pickCsv(row, 'shares'), line, 'Partages'),
      clicks: parseCsvMetric(pickCsv(row, 'clicks'), line, 'Clics'),
      orders: parseCsvMetric(pickCsv(row, 'orders'), line, 'Commandes'),
    }];
  });
  if (!entries.length) throw new Error('Aucun contenu à importer. Ajoutez un titre à chaque ligne.');
  return entries;
}
