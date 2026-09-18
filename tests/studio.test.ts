import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { calendarCsv, emptyEntry, parseCalendarCsv, parseProjectCsv, parseScenarioCsv, projectCsv, projectCsvExample, scenarioCsvExample, type Entry } from '../lib/model';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));
async function setup() { const t = convexTest(schema, modules); const id = await t.run(ctx => ctx.db.insert('users', { githubId: '123' })); return { t, owner: t.withIdentity({ subject: id + '|session' }), id }; }
describe('Accès privé', () => {
    it('refuse les lectures et toutes les mutations sans connexion', async () => { const { t, owner } = await setup(); const id = await owner.mutation(anyApi.studio.save, { data: { ...emptyEntry('publication'), title: 'Test' } }); await expect(t.query(anyApi.studio.list)).rejects.toThrow('Connexion requise'); for (const [fn, args] of [[anyApi.studio.initialize, {}], [anyApi.studio.save, { data: { ...emptyEntry('publication'), title: 'Test' } }], [anyApi.studio.remove, { id, revision: 1 }]] as const) await expect(t.mutation(fn, args)).rejects.toThrow('Connexion requise'); });
    it('refuse un autre compte et une configuration propriétaire absente', async () => { const { t, owner } = await setup(); const other = await t.run(ctx => ctx.db.insert('users', { githubId: '456' })); await expect(t.withIdentity({ subject: other + '|session' }).query(anyApi.studio.list)).rejects.toThrow('propriétaire'); vi.stubEnv('OWNER_GITHUB_ID', ''); await expect(owner.query(anyApi.studio.list)).rejects.toThrow('propriétaire'); });
});
describe('Organisation et persistance', () => {
    it('importe 42 contenus une seule fois, conserve les modifications et lie les projets', async () => { const { owner } = await setup(); expect(await owner.mutation(anyApi.studio.initialize)).toEqual({ inserted: 62 }); let entries = await owner.query(anyApi.studio.list); expect(entries.filter((e: Entry) => e.kind === 'publication')).toHaveLength(42); const e = entries.find((e: Entry) => e.kind === 'publication'); const data = { ...emptyEntry('publication'), title: 'Mon texte conservé', projectId: e.projectId }; await owner.mutation(anyApi.studio.save, { id: e._id, revision: 1, data }); expect(await owner.mutation(anyApi.studio.initialize)).toEqual({ inserted: 0 }); entries = await owner.query(anyApi.studio.list); expect(entries).toHaveLength(62); expect(entries.find((x: Entry) => x._id === e._id).title).toBe(data.title); for (const x of entries.filter((x: Entry) => x.projectId)) expect(entries.find((p: Entry) => p._id === x.projectId)?.kind).toBe('projet'); });
    it('crée, déplace, duplique, synchronise les sessions et refuse les écrasements concurrents', async () => { const { t, owner, id: userId } = await setup(); const data = { ...emptyEntry('publication'), title: 'Astuce', date: '2026-09-20', reach: null, saves: 0 }; const id = await owner.mutation(anyApi.studio.save, { data }); const session2 = t.withIdentity({ subject: userId + '|autre-session' }); expect((await session2.query(anyApi.studio.list))[0].reach).toBeNull(); await owner.mutation(anyApi.studio.save, { id, revision: 1, data: { ...data, date: '2026-09-22' } }); expect((await session2.query(anyApi.studio.list))[0].date).toBe('2026-09-22'); await expect(session2.mutation(anyApi.studio.save, { id, revision: 1, data })).rejects.toThrow('autre session'); const duplicate = await owner.mutation(anyApi.studio.save, { data: { ...data, title: 'Copie' } }); await owner.mutation(anyApi.studio.remove, { id: duplicate, revision: 1 }); expect(await owner.query(anyApi.studio.list)).toHaveLength(1); });
    it('enregistre les tâches et détache les contenus avant suppression du projet', async () => { const { owner } = await setup(); const project = { ...emptyEntry('projet'), title: 'Série', status: 'En cours', tasks: [{ id: 't1', title: 'Filmer', done: true }] }; const id = await owner.mutation(anyApi.studio.save, { data: project }); await owner.mutation(anyApi.studio.save, { data: { ...emptyEntry('publication'), title: 'Vidéo', projectId: id } }); expect((await owner.query(anyApi.studio.list)).find((e: Entry) => e._id === id).tasks[0].done).toBe(true); await owner.mutation(anyApi.studio.remove, { id, revision: 1 }); expect((await owner.query(anyApi.studio.list))[0].projectId).toBe(''); });
    it('archive un scénario dans Convex sans le supprimer', async () => {
        const { owner } = await setup();
        const id = await owner.mutation(anyApi.studio.save, { data: { ...emptyEntry('scenario'), title: 'Welcome' } });
        const result = await owner.action(anyApi.klaviyoSync.archiveScenario, { entryId: id, revision: 1, deleteFromKlaviyo: false });
        expect(result).toEqual({ revision: 2, klaviyoDeleted: false });
        const archived = (await owner.query(anyApi.studio.list)).find((e: Entry) => e._id === id);
        expect(archived.status).toBe('Archivé');
        expect(archived.title).toBe('Welcome');
    });
    it('complète emailSteps manquant sur les fiches déjà enregistrées', async () => {
        const { t, owner } = await setup();
        const { emailSteps: _emailSteps, ...legacy } = emptyEntry('strategie');
        await t.run(ctx => ctx.db.insert('entries', { ...legacy, title: 'Ancienne fiche', revision: 1 }));
        expect((await owner.query(anyApi.studio.list))[0].emailSteps).toEqual([]);
        expect(await owner.mutation(anyApi.studio.initialize)).toEqual({ inserted: 62 });
        const entries = await owner.query(anyApi.studio.list);
        expect(entries.every((e: Entry) => Array.isArray(e.emailSteps))).toBe(true);
        expect(entries.find((e: Entry) => e.title === 'Ancienne fiche')?.emailSteps).toEqual([]);
    });
    it('refuse les dates impossibles, liens dangereux, chiffres négatifs et projets inconnus', async () => { const { owner } = await setup(); for (const patch of [{ date: '2026-02-30' }, { url: 'javascript:alert(1)' }, { reach: -1 }, { projectId: 'inexistant' }]) await expect(owner.mutation(anyApi.studio.save, { data: { ...emptyEntry('publication'), title: 'Test', ...patch } })).rejects.toThrow(); });
    it('exporte zéro et vide distinctement et protège les cellules CSV', () => { const csv = calendarCsv([{ ...emptyEntry('publication'), _id: '1', revision: 1, title: '=HYPERLINK("x")', reach: 0, saves: null }]); expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain('"0";""'); });
    it('réimporte un export CSV et accepte les en-têtes français', () => {
        const project = { _id: 'jd7project', title: 'Série d’astuces' };
        const csv = calendarCsv([{ ...emptyEntry('publication'), _id: '1', revision: 1, title: '=HYPERLINK("x")', date: '2026-09-20', status: 'Programmé', stage: 'Participation', hook: 'Une accroche', reach: 0, saves: null, projectId: project._id, text: 'Ligne 1\nLigne 2' }]);
        const [row] = parseCalendarCsv(csv, [project]);
        expect(row).toMatchObject({ title: '=HYPERLINK("x")', date: '2026-09-20', status: 'Programmé', stage: 'Participation', hook: 'Une accroche', reach: 0, saves: null, projectId: project._id, text: 'Ligne 1\nLigne 2' });
        const french = parseCalendarCsv('Titre;Date;Étape;Statut;Projet\nLe coffret;18/09/2026;Offre;À préparer;Série d’astuces', [project]);
        expect(french[0]).toMatchObject({ title: 'Le coffret', date: '2026-09-18', stage: 'Offre', status: 'À préparer', projectId: project._id });
    });
    it('refuse un CSV sans titre, une date impossible et un projet inconnu', () => {
        expect(() => parseCalendarCsv('', [])).toThrow('vide');
        expect(() => parseCalendarCsv('title\n', [])).toThrow('Aucun contenu');
        expect(() => parseCalendarCsv('title;date\nAstuce;2026-02-30', [])).toThrow('Date invalide');
        expect(() => parseCalendarCsv('title;projet\nAstuce;Inconnu', [])).toThrow('introuvable');
    });
});
describe('Import CSV scénarios', () => {
    it('regroupe les lignes par scénario et accepte les en-têtes français', () => {
        const csv = scenarioCsvExample();
        const scenarios = parseScenarioCsv(csv);
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0]).toMatchObject({ kind: 'scenario', title: 'Welcome series', status: 'Brouillon' });
        expect(scenarios[0].emailSteps).toHaveLength(3);
        expect(scenarios[0].emailSteps[1]).toMatchObject({ delayDays: 2, subject: expect.stringContaining('histoire') });
        const french = parseScenarioCsv('Scénario;Statut;Délai (jours);Objet;Corps\nSérie bienvenue;Actif;0;Bonjour;<p>Texte</p>\nSérie bienvenue;Actif;3;Relance;<p>Suite</p>');
        expect(french).toHaveLength(1);
        expect(french[0].title).toBe('Série bienvenue');
        expect(french[0].emailSteps).toHaveLength(2);
    });
    it('refuse un CSV vide ou sans scénario', () => {
        expect(() => parseScenarioCsv('')).toThrow('vide');
        expect(() => parseScenarioCsv('subject;body\nHello;<p>x</p>')).toThrow('Scénario');
    });
});
describe('Import CSV projets', () => {
    it('importe l’exemple, accepte les en-têtes français et réimporte un export', () => {
        const rows = parseProjectCsv(projectCsvExample());
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ kind: 'projet', title: 'Valider la cible', status: 'À faire', date: '2026-09-30', priority: 'Haute' });
        expect(rows[0].tasks.map(t => t.title)).toEqual(['Interroger cinq clientes', 'Séparer acheteuses', 'Reporter leurs mots']);
        expect(rows[0].tasks.every(t => t.done === false)).toBe(true);
        const french = parseProjectCsv('Titre;Statut;Échéance;Priorité;Notes;Étapes\nKit Noël;En cours;15/11/2026;Basse;Dates à valider;[x] Photographier | Rédiger la fiche');
        expect(french).toHaveLength(1);
        expect(french[0]).toMatchObject({ title: 'Kit Noël', status: 'En cours', date: '2026-11-15', priority: 'Basse', text: 'Dates à valider' });
        expect(french[0].tasks).toMatchObject([{ title: 'Photographier', done: true }, { title: 'Rédiger la fiche', done: false }]);
        const exported = projectCsv([{ ...emptyEntry('projet'), _id: '1', revision: 1, title: '=HYPERLINK("x")', status: 'Bloqué', date: '2026-12-01', priority: 'Haute', text: 'Ligne 1\nLigne 2', tasks: [{ id: 't1', title: 'Filmer', done: true }, { id: 't2', title: 'Monter', done: false }] }]);
        expect(exported).toContain("'=HYPERLINK");
        const [roundtrip] = parseProjectCsv(exported);
        expect(roundtrip).toMatchObject({ title: '=HYPERLINK("x")', status: 'Bloqué', date: '2026-12-01', priority: 'Haute', text: 'Ligne 1\nLigne 2' });
        expect(roundtrip.tasks.map(({ title, done }) => ({ title, done }))).toEqual([{ title: 'Filmer', done: true }, { title: 'Monter', done: false }]);
    });
    it('refuse un CSV vide, un statut inconnu et une date impossible', () => {
        expect(() => parseProjectCsv('')).toThrow('vide');
        expect(() => parseProjectCsv('status;notes\nÀ faire;x')).toThrow('Titre');
        expect(() => parseProjectCsv('title\n')).toThrow('Aucun projet');
        expect(() => parseProjectCsv('title;status\nSérie;Inconnu')).toThrow('Statut');
        expect(() => parseProjectCsv('title;date\nSérie;2026-02-30')).toThrow('Date invalide');
        expect(() => parseProjectCsv('title;priorité\nSérie;Urgente')).toThrow('Priorité');
    });
});
