import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyPortrait, lifeDates, mergePortrait, newsError, newsWhen, normalizeNews, normalizePortrait, portraitError, sortTimeline } from '../lib/veille';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.stubEnv('OWNER_GITHUB_ID', '123'); vi.stubEnv('OPENROUTER_API_KEY', ''); vi.stubEnv('EXA_API_KEY', ''); });

let n = 0;
const id = () => 'id' + n++;
const news = (patch: Record<string, unknown> = {}) => ({ kind: 'exposition', title: 'Fils d’or', summary: '', place: 'Musée', city: 'Lyon', country: 'France', zone: 'france', startDate: '2026-11-01', endDate: '2027-01-15', url: 'https://musee.fr/fils', ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (u: Record<string, unknown>) => { const uid = await t.run(ctx => ctx.db.insert('users', u)); return t.withIdentity({ subject: uid + '|session' }); };
    return { t, atelier: await as({ githubId: '123' }), lola: await as({ name: 'Lola', role: 'stagiaire' }), marie: await as({ name: 'Marie', role: 'cliente' }) };
}

describe('Veille textile : modèle', () => {
    it('valide les portraits et les nouvelles', () => {
        expect(portraitError(emptyPortrait('Aurélie'))).toBeNull();
        expect(portraitError(emptyPortrait(' '))).toMatch('nom');
        expect(portraitError({ ...emptyPortrait('A'), birthDate: '12/03/1975' })).toMatch('AAAA');
        expect(portraitError({ ...emptyPortrait('A'), timeline: [{ id: 'x', date: '2026', kind: 'residence', label: '' }] })).toMatch('libellé');
        expect(portraitError({ ...emptyPortrait('A'), website: 'http://x.fr' })).toMatch('https');
        expect(newsError(news() as never)).toBeNull();
        expect(newsError(news({ endDate: '2026-10-01' }) as never)).toMatch('fin');
    });

    it('affiche les dates de vie et classe les nouvelles dans le temps', () => {
        expect(lifeDates({ birthDate: '1975', deathDate: '' })).toBe('née en 1975');
        expect(lifeDates({ birthDate: '1902-03', deathDate: '1980-11-02' })).toBe('mars 1902 – 2 nov. 1980');
        expect(sortTimeline([{ date: '2026-03' }, { date: '2003' }, { date: '2026' }]).map(t => t.date)).toEqual(['2003', '2026', '2026-03']);
        const today = '2026-10-20';
        expect(newsWhen({ startDate: '2026-11-01', endDate: '' }, today)).toBe('upcoming');
        expect(newsWhen({ startDate: '2026-09-01', endDate: '2026-10' }, today)).toBe('current');
        expect(newsWhen({ startDate: '2026-03', endDate: '2026-08' }, today)).toBe('past');
        expect(newsWhen({ startDate: '', endDate: '' }, today)).toBe('undated');
    });

    it('corrige ce que renvoie l’agent au lieu d’échouer', () => {
        const p = normalizePortrait({ name: ' Aurélie ', country: 'France', zone: 'mars', birthDate: 'vers 1980', website: 'http://x', techniques: ['Lunéville', 'Lunéville', ''],
            timeline: [{ date: '2026-03', kind: 'voyage', label: 'Kyoto' }, { date: '?', kind: 'vie', label: 'x' }], sources: [{ url: 'https://a.fr' }, { url: 'https://a.fr' }], works: [{ title: '' }] }, id);
        expect(p).toMatchObject({ name: 'Aurélie', zone: 'france', birthDate: '', website: '', techniques: ['Lunéville'], works: [] });
        expect(p.timeline).toMatchObject([{ date: '2026-03', kind: 'autre', label: 'Kyoto' }]);
        expect(p.sources).toHaveLength(1);
        expect(portraitError(p)).toBeNull();
        expect(normalizeNews({ title: '' })).toBeNull();
        expect(normalizeNews({ title: 'Salon', kind: 'x', startDate: '2026-05-02', endDate: '2026-05-01' })).toMatchObject({ kind: 'actualite', endDate: '', zone: 'monde' });
    });

    it('complète un portrait sans perdre ce qui a été saisi à la main', () => {
        const mine = { ...emptyPortrait('Aurélie'), summary: 'Mon résumé', works: [{ id: 'a', title: 'Pétales', year: '', technique: '', description: 'à la main', url: '', imageUrl: '' }] };
        const found = { ...emptyPortrait('Aurélie'), summary: 'Résumé trouvé', country: 'Belgique', zone: 'europe' as const,
            works: [{ id: 'b', title: 'pétales', year: '2020', technique: '', description: '', url: '', imageUrl: '' }, { id: 'c', title: 'Nœuds', year: '2026', technique: '', description: '', url: '', imageUrl: '' }] };
        const merged = mergePortrait(mine, found);
        expect(merged.summary).toBe('Résumé trouvé');
        expect(merged.zone).toBe('europe');
        expect(merged.works.map(w => w.title)).toEqual(['Pétales', 'Nœuds']);
        expect(merged.works[0]!.description).toBe('à la main');
    });
});

describe('Veille textile : partage et agent', () => {
    it('est partagée entre l’atelier et les stagiaires, pas avec les clientes', async () => {
        const { atelier, lola, marie } = await setup();
        const aid = await lola.mutation(anyApi.veille.saveArtist, { data: { ...emptyPortrait('Aurélie Lanoiselée'), techniques: ['Lunéville'] } });
        await atelier.mutation(anyApi.veille.saveNews, { data: news(), artistIds: [aid] });
        expect((await atelier.query(anyApi.veille.artists)).map((a: { name: string }) => a.name)).toEqual(['Aurélie Lanoiselée']);
        expect((await lola.query(anyApi.veille.news))[0].artists).toEqual([{ _id: aid, name: 'Aurélie Lanoiselée' }]);
        expect((await lola.query(anyApi.veille.artist, { id: aid })).news).toHaveLength(1);
        await expect(marie.query(anyApi.veille.artists)).rejects.toThrow('stagiaire');
        await expect(atelier.mutation(anyApi.veille.saveArtist, { data: emptyPortrait('aurelie  LANOISELEE') })).rejects.toThrow('déjà');
    });

    it('explique que l’agent n’est pas branché sans clé Exa ni OpenRouter', async () => {
        const { lola } = await setup();
        expect((await lola.query(anyApi.veille.agentStatus)).available).toBe(false);
        await expect(lola.mutation(anyApi.veille.research, { name: 'Aurélie' })).rejects.toThrow('OPENROUTER_API_KEY');
    });

    it('lance une seule recherche à la fois sur une artiste', async () => {
        // Horloge figée : la recherche programmée ne part pas vers l'API pendant le test.
        vi.useFakeTimers(); vi.stubEnv('OPENROUTER_API_KEY', 'test');
        const { t, lola } = await setup();
        const aid = await lola.mutation(anyApi.veille.research, { name: 'Aurélie Lanoiselée', hint: 'Kyoto' });
        const row = await t.run(ctx => ctx.db.get(aid));
        expect(row).toMatchObject({ research: 'running', researchHint: 'Kyoto' });
        await expect(lola.mutation(anyApi.veille.research, { name: 'aurélie lanoiselée' })).rejects.toThrow('déjà en cours');
        // La recherche entre au journal, visible par l'atelier seulement, avec le modèle par défaut.
        const atelier = t.withIdentity({ subject: (await t.run(ctx => ctx.db.insert('users', { githubId: '123' }))) + '|session' });
        const [run] = await atelier.query(anyApi.veille.runs);
        expect(run).toMatchObject({ kind: 'portrait', subject: 'Aurélie Lanoiselée', startedBy: 'Lola', model: 'anthropic/claude-haiku-5.5', status: 'running', cost: 0 });
        await expect(lola.query(anyApi.veille.runs)).rejects.toThrow('propriétaire');
        await t.mutation(anyApi.veille.logRun, { runId: run._id, lines: [{ level: 'info', text: 'Tour 1' }], cost: 0.012, searches: 4 });
        await t.mutation(anyApi.veille.logRun, { runId: run._id, lines: [], cost: 0.008, searches: 2 });
        await t.mutation(anyApi.veille.researchFailed, { id: aid, runId: run._id, error: 'Plus assez de crédits sur OpenRouter.' });
        const [ended] = await atelier.query(anyApi.veille.runs);
        expect(ended).toMatchObject({ status: 'error', searches: 6, error: 'Plus assez de crédits sur OpenRouter.' });
        expect(ended.cost).toBeCloseTo(0.02);
        expect(ended.log.map((l: { text: string }) => l.text).at(-1)).toMatch('crédits');
        expect((await lola.query(anyApi.veille.artist, { id: aid })).lastRun).toMatchObject({ status: 'error', model: 'anthropic/claude-haiku-5.5' });
        vi.useRealTimers();
    });

    it('importe un portrait, le fusionne au suivant et ne double pas les nouvelles', async () => {
        const { t, lola } = await setup();
        const first = { name: 'Aurélie Lanoiselée', country: 'France', works: [{ title: 'Pétales' }], news: [news({ title: 'Futurotextiles' })] };
        const r1 = await t.mutation(anyApi.veille.importPortrait, { json: JSON.stringify(first) });
        const r2 = await t.mutation(anyApi.veille.importPortrait, { json: JSON.stringify({ ...first, works: [{ title: 'Nœuds' }], news: [news({ title: 'futurotextiles' }), news({ title: 'Kujoyama', url: '' })] }) });
        expect(r2.id).toBe(r1.id);
        expect(r2.news).toBe(1);
        const a = await lola.query(anyApi.veille.artist, { id: r1.id });
        expect(a.works.map((w: { title: string }) => w.title)).toEqual(['Pétales', 'Nœuds']);
        expect(a.news).toHaveLength(2);
    });
});
