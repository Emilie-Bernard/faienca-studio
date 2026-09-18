export const contentStatuses = ['À préparer', 'En production', 'Programmé', 'Publié', 'À recycler'] as const;
export const projectStatuses = ['À envisager', 'À faire', 'En cours', 'Bloqué', 'Terminé'] as const;
export const projectPriorities = ['Haute', 'Normale', 'Basse'] as const;
export const stages = ['Astuce', 'Participation', 'Projet complet', 'Offre'] as const;
export const certainties = ['Hypothèse', 'À tester', 'Validé'] as const;
export const newsletterCampaignStatuses = ['Brouillon', 'Programmé', 'Envoyé', 'Archivé'] as const;
export const scenarioStatuses = ['Brouillon', 'Actif', 'En pause', 'Archivé'] as const;
export type Kind = 'publication' | 'projet' | 'strategie' | 'newsletter' | 'scenario';
export interface Task { id: string; title: string; done: boolean }
export interface EmailStep {
  id: string; delayDays: number; subject: string; body: string;
  klaviyoTemplateId?: string; klaviyoFlowActionId?: string; klaviyoDelayActionId?: string;
}
export interface Entry {
  _id: string; kind: Kind; title: string; text: string; status: string;
  date: string; channel: string; format: string; objective: string;
  hook: string; cta: string; stories: string; offer: string; projectId: string;
  stage: string; priority: string; category: string; tasks: Task[];
  emailSteps: EmailStep[];
  klaviyoCampaignId?: string; klaviyoCampaignMessageId?: string; klaviyoTemplateId?: string;
  klaviyoFlowId?: string; klaviyoFlowStructure?: string;
  url: string; caveat: string; original: string; revision: number;
  reach: number | null; saves: number | null; shares: number | null;
  clicks: number | null; orders: number | null;
}
export type EntryInput = Omit<Entry, '_id' | 'revision'>;
export function emptyEntry(kind: Kind): EntryInput {
  const base = {
    title: '', text: '', date: '', channel: 'Instagram', format: 'Reel', objective: '', hook: '', cta: '', stories: '', offer: '', projectId: '', stage: 'Astuce', priority: 'Normale', category: 'Cible', tasks: [] as Task[], emailSteps: [] as EmailStep[], url: '', caveat: '', original: '', reach: null, saves: null, shares: null, clicks: null, orders: null,
  };
  if (kind === 'publication') return { ...base, kind, status: 'À préparer' };
  if (kind === 'projet') return { ...base, kind, status: 'À faire' };
  if (kind === 'strategie') return { ...base, kind, status: 'Hypothèse' };
  if (kind === 'newsletter') return { ...base, kind, status: 'Brouillon', channel: 'E-mail', format: 'Newsletter' };
  return {
    ...base,
    kind,
    status: 'Brouillon',
    channel: 'E-mail',
    format: 'Séquence',
    emailSteps: [{ id: crypto.randomUUID(), delayDays: 0, subject: '', body: '' }],
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

export const scenarioCsvFields = ['scenario', 'status', 'delayDays', 'subject', 'body', 'caveat'] as const;
export type ScenarioCsvField = typeof scenarioCsvFields[number];

const scenarioCsvHeaderAliases: Record<string, ScenarioCsvField> = {
  scenario: 'scenario', scenariotitle: 'scenario', titrescenario: 'scenario', titres: 'scenario', nom: 'scenario',
  status: 'status', statut: 'status',
  delaydays: 'delayDays', delai: 'delayDays', delaijours: 'delayDays', jours: 'delayDays', jour: 'delayDays',
  subject: 'subject', objet: 'subject', sujet: 'subject',
  body: 'body', corps: 'body', texte: 'body', contenu: 'body', message: 'body',
  caveat: 'caveat', notes: 'caveat', notespourklaviyo: 'caveat', note: 'caveat',
};

function pickScenarioCsv(row: Partial<Record<ScenarioCsvField, string>>, field: ScenarioCsvField) {
  return unescapeCsvValue(row[field] ?? '').trim();
}

function parseScenarioDelay(raw: string, line: number) {
  const value = raw.trim();
  if (!value) return 0;
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isSafeInteger(n) || n < 0 || n > 365) throw new Error(`Le délai doit être un nombre de jours entre 0 et 365 (ligne ${line}).`);
  return n;
}

export function scenarioCsvExample() {
  return '\uFEFF' + [
    scenarioCsvFields.join(';'),
    ['Welcome series', 'Brouillon', '0', 'Bienvenue chez Faïença', '<h2>Bonjour</h2><p>Merci de votre inscription. Voici l’atelier, le fil et le Sud.</p>', 'Recopier dans un Flow Klaviyo'].map(csvEscape).join(';'),
    ['Welcome series', 'Brouillon', '2', 'L’histoire de Faïença', '<p>Depuis l’atelier, nous créons des pièces uniques…</p>', ''].map(csvEscape).join(';'),
    ['Welcome series', 'Brouillon', '7', 'Votre première création', '<p>Commencez par une astuce simple, puis découvrez le kit vedette.</p><p style="text-align:center;margin:28px 0;"><a href="https://faienca.fr" style="display:inline-block;padding:14px 28px;background:#bb633e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Découvrir Faïença</a></p>', ''].map(csvEscape).join(';'),
  ].join('\r\n');
}

export function scenarioCsv(entries: Entry[]) {
  const rows = entries
    .filter(e => e.kind === 'scenario')
    .flatMap(entry => (entry.emailSteps ?? []).map((step, index) => ({
      scenario: entry.title,
      status: entry.status,
      delayDays: step.delayDays,
      subject: step.subject,
      body: step.body,
      caveat: index === 0 ? entry.caveat : '',
    })));
  return '\uFEFF' + [scenarioCsvFields.join(';'), ...rows.map(row => scenarioCsvFields.map(k => csvEscape(row[k])).join(';'))].join('\r\n');
}

export function parseScenarioCsv(text: string): EntryInput[] {
  const table = parseCsvTable(text);
  if (!table.length) throw new Error('Ce fichier CSV est vide.');
  const header = table[0]!.map(normalizeCsvHeader);
  const mapped = header.map(cell => scenarioCsvHeaderAliases[cell]);
  const hasHeaders = mapped.some(Boolean);
  const columns: (ScenarioCsvField | undefined)[] = hasHeaders ? mapped : scenarioCsvFields.map((field, i) => header[i] === undefined ? undefined : field);
  const dataRows = hasHeaders ? table.slice(1) : table;
  if (hasHeaders && !columns.includes('scenario')) throw new Error('Ajoutez une colonne Scénario, comme dans l’exemple CSV.');
  if (dataRows.length > 200) throw new Error('Limitez l’import à 200 lignes à la fois.');

  type Row = { line: number; scenario: string; status: string; delayDays: number; subject: string; body: string; caveat: string };
  const parsedRows: Row[] = dataRows.flatMap((cells, index) => {
    const line = index + (hasHeaders ? 2 : 1);
    const row: Partial<Record<ScenarioCsvField, string>> = {};
    columns.forEach((field, i) => { if (field) row[field] = cells[i] ?? ''; });
    if (columns.every((field, i) => !unescapeCsvValue(cells[i] ?? '').trim())) return [];
    const scenario = pickScenarioCsv(row, 'scenario');
    if (!scenario) throw new Error(`Le nom du scénario est obligatoire à la ligne ${line}.`);
    if (scenario.length > 200) throw new Error(`Le nom du scénario dépasse 200 caractères à la ligne ${line}.`);
    const status = pickScenarioCsv(row, 'status') || 'Brouillon';
    if (!(scenarioStatuses as readonly string[]).includes(status)) throw new Error(`Statut « ${status} » inconnu à la ligne ${line}.`);
    return [{
      line,
      scenario,
      status,
      delayDays: parseScenarioDelay(pickScenarioCsv(row, 'delayDays'), line),
      subject: pickScenarioCsv(row, 'subject'),
      body: pickScenarioCsv(row, 'body'),
      caveat: pickScenarioCsv(row, 'caveat'),
    }];
  });

  if (!parsedRows.length) throw new Error('Aucun scénario à importer. Ajoutez au moins une ligne avec un nom de scénario.');
  if (parsedRows.length > 200) throw new Error('Limitez l’import à 200 lignes à la fois.');

  const grouped = new Map<string, Row[]>();
  for (const row of parsedRows) {
    const key = row.scenario.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  if (grouped.size > 50) throw new Error('Limitez l’import à 50 scénarios à la fois.');

  return [...grouped.values()].map(rowsForScenario => {
    const sorted = [...rowsForScenario].sort((a, b) => a.delayDays - b.delayDays || a.line - b.line);
    if (sorted.length > 20) throw new Error(`Le scénario « ${sorted[0]!.scenario} » dépasse 20 e-mails.`);
    const statuses = [...new Set(sorted.map(r => r.status))];
    if (statuses.length > 1) throw new Error(`Le scénario « ${sorted[0]!.scenario} » mélange plusieurs statuts. Utilisez un seul statut par scénario.`);
    for (const row of sorted) {
      if (row.subject.length > 200) throw new Error(`Un objet dépasse 200 caractères dans « ${row.scenario} » (ligne ${row.line}).`);
    }
    const caveat = sorted.find(r => r.caveat)?.caveat ?? '';
    return {
      ...emptyEntry('scenario'),
      title: sorted[0]!.scenario,
      status: sorted[0]!.status,
      caveat,
      emailSteps: sorted.map(row => ({
        id: crypto.randomUUID(),
        delayDays: row.delayDays,
        subject: row.subject,
        body: row.body,
      })),
    };
  });
}

export const projectCsvFields = ['title', 'status', 'date', 'priority', 'text', 'tasks'] as const;
export type ProjectCsvField = typeof projectCsvFields[number];

const projectCsvHeaderAliases: Record<string, ProjectCsvField> = {
  title: 'title', titre: 'title', projet: 'title', nom: 'title', nomduprojet: 'title',
  status: 'status', statut: 'status',
  date: 'date', echeance: 'date', deadline: 'date',
  priority: 'priority', priorite: 'priority',
  text: 'text', notes: 'text', texte: 'text', description: 'text',
  tasks: 'tasks', etapes: 'tasks', taches: 'tasks', etapesduprojet: 'tasks',
};

function pickProjectCsv(row: Partial<Record<ProjectCsvField, string>>, field: ProjectCsvField) {
  return unescapeCsvValue(row[field] ?? '').trim();
}

function parseProjectTasks(raw: string, line: number): Task[] {
  const tasks = raw.split('|').flatMap(part => {
    const value = unescapeCsvValue(part).trim();
    if (!value) return [];
    const done = /^\[x\]\s+/i.test(value);
    const title = (done ? value.replace(/^\[x\]\s+/i, '') : value).trim();
    if (!title) return [];
    return [{ id: crypto.randomUUID(), title, done }];
  });
  if (tasks.length > 100) throw new Error(`Limitez le projet à 100 étapes (ligne ${line}).`);
  return tasks;
}

export function projectCsvExample() {
  return '\uFEFF' + [
    projectCsvFields.join(';'),
    ['Valider la cible', 'À faire', '2026-09-30', 'Haute', 'Faire parler les clientes.', 'Interroger cinq clientes | Séparer acheteuses | Reporter leurs mots'].map(csvEscape).join(';'),
    ['Confirmer les produits', 'À faire', '2026-10-05', 'Haute', 'Kit vedette, stock et marge.', 'Confirmer le kit vedette | Photographier le contenu | Afficher les prix'].map(csvEscape).join(';'),
  ].join('\r\n');
}

export function projectCsv(entries: Entry[]) {
  const rows = entries.filter(e => e.kind === 'projet').map(e => ({
    title: e.title,
    status: e.status,
    date: e.date,
    priority: e.priority,
    text: e.text,
    tasks: e.tasks.map(t => (t.done ? '[x] ' : '') + t.title).join(' | '),
  }));
  return '\uFEFF' + [projectCsvFields.join(';'), ...rows.map(row => projectCsvFields.map(k => csvEscape(row[k])).join(';'))].join('\r\n');
}

export function parseProjectCsv(text: string): EntryInput[] {
  const table = parseCsvTable(text);
  if (!table.length) throw new Error('Ce fichier CSV est vide.');
  const header = table[0]!.map(normalizeCsvHeader);
  const mapped = header.map(cell => projectCsvHeaderAliases[cell]);
  const hasHeaders = mapped.some(Boolean);
  const columns: (ProjectCsvField | undefined)[] = hasHeaders ? mapped : projectCsvFields.map((field, i) => header[i] === undefined ? undefined : field);
  const dataRows = hasHeaders ? table.slice(1) : table;
  if (hasHeaders && !columns.includes('title')) throw new Error('Ajoutez une colonne Titre, comme dans l’exemple CSV des projets.');
  if (dataRows.length > 200) throw new Error('Limitez l’import à 200 projets à la fois.');

  const entries = dataRows.flatMap((cells, index) => {
    const line = index + (hasHeaders ? 2 : 1);
    const row: Partial<Record<ProjectCsvField, string>> = {};
    columns.forEach((field, i) => { if (field) row[field] = cells[i] ?? ''; });
    if (columns.every((field, i) => !unescapeCsvValue(cells[i] ?? '').trim())) return [];
    const title = pickProjectCsv(row, 'title');
    if (!title) throw new Error(`Le titre est obligatoire à la ligne ${line}.`);
    if (title.length > 200) throw new Error(`Le titre dépasse 200 caractères à la ligne ${line}.`);
    const status = pickProjectCsv(row, 'status') || 'À faire';
    if (!(projectStatuses as readonly string[]).includes(status)) throw new Error(`Statut « ${status} » inconnu à la ligne ${line}.`);
    const priority = pickProjectCsv(row, 'priority') || 'Normale';
    if (!(projectPriorities as readonly string[]).includes(priority)) throw new Error(`Priorité « ${priority} » inconnue à la ligne ${line}.`);
    return [{
      ...emptyEntry('projet'),
      title,
      status,
      date: parseCsvDate(pickProjectCsv(row, 'date'), line),
      priority,
      text: pickProjectCsv(row, 'text'),
      tasks: parseProjectTasks(pickProjectCsv(row, 'tasks'), line),
    }];
  });
  if (!entries.length) throw new Error('Aucun projet à importer. Ajoutez un titre à chaque ligne.');
  return entries;
}
