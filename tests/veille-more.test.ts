import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyPortrait, emptyWorkshop, mergeWorkshop, normalizeVideo, normalizeWorkshop, platformOf, videoError, workshopError, youtubeId } from '../lib/veille';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.stubEnv('OWNER_GITHUB_ID', '123'); vi.stubEnv('OPENROUTER_API_KEY', ''); vi.stubEnv('EXA_API_KEY', ''); vi.stubEnv('EXA_EFFORT', ''); });

let n = 0;
const id = () => 'id' + n++;

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (u: Record<string, unknown>) => { const uid = await t.run(ctx => ctx.db.insert('users', u)); return t.withIdentity({ subject: uid + '|session' }); };
    return { t, atelier: await as({ githubId: '123' }), lola: await as({ name: 'Lola', role: 'stagiaire' }), marie: await as({ name: 'Marie', role: 'cliente' }) };
}

describe('Ateliers de broderie d’art', () => {
    it('valide, met en forme et complète une fiche', () => {
        expect(workshopError(emptyWorkshop('Hurel'))).toBeNull();
        expect(workshopError({ ...emptyWorkshop('Hurel'), foundedDate: 'vers 1879' })).toMatch('AAAA');
        const w = normalizeWorkshop({ name: 'Hurel', foundedDate: '1879', people: [{ name: 'Martin Hurel', role: 'dirigeant' }, { name: 'martin hurel' }], founders: ['A', 'A'] }, id);
        expect(w).toMatchObject({ country: 'France', founders: ['A'], people: [{ name: 'Martin Hurel', role: 'dirigeant' }] });
        const merged = mergeWorkshop({ ...w, summary: 'Mon texte', clients: ['Dior'] }, { ...w, summary: 'Trouvé', clients: ['dior', 'Chanel'], people: [{ name: 'Paul de Bermingham', role: '' }] });
        expect(merged.summary).toBe('Trouvé');
        expect(merged.clients).toEqual(['Dior', 'Chanel']);
        expect(merged.people.map(p => p.name)).toEqual(['Martin Hurel', 'Paul de Bermingham']);
    });

    it('complète l’image d’une réalisation déjà connue au lieu de la dupliquer', () => {
        const work = (title: string, imageUrl = '') => ({ id: id(), title, year: '', technique: '', description: '', url: '', imageUrl });
        const merged = mergeWorkshop({ ...emptyWorkshop('Hurel'), works: [work('Robe Junon')] }, { ...emptyWorkshop('Hurel'), works: [work('robe junon', 'https://musee.fr/junon.jpg'), work('Veste Iris')] });
        expect(merged.works.map(w => [w.title, w.imageUrl])).toEqual([['Robe Junon', 'https://musee.fr/junon.jpg'], ['Veste Iris', '']]);
        expect(workshopError({ ...emptyWorkshop('Hurel'), works: [work('X', 'http://x.fr/a.jpg')] })).toMatch('https');
    });

    it('relie les personnes à leur portrait, et s’importe sans doublon', async () => {
        const { t, lola, marie } = await setup();
        await lola.mutation(anyApi.veille.saveArtist, { data: emptyPortrait('Sylvie Deschamps') });
        const json = JSON.stringify({ name: 'L’atelier du Bégonia d’Or', city: 'Rochefort', foundedDate: '1995', founders: ['Sylvie Deschamps'], people: [{ name: 'Marlène Rouhaud', role: 'première d’atelier' }] });
        const first = await t.mutation(anyApi.veilleAteliers.importWorkshop, { json });
        const again = await t.mutation(anyApi.veilleAteliers.importWorkshop, { json: JSON.stringify({ name: 'l’atelier du begonia d’or', clients: ['Cartier'] }) });
        expect(first.created).toBe(true);
        expect(again).toEqual({ id: first.id, created: false });
        const w = await lola.query(anyApi.veilleAteliers.get, { id: first.id });
        expect(w.clients).toEqual(['Cartier']);
        expect(w.founderLinks[0].artistId).toBeTruthy();
        expect(w.peopleLinks[0].artistId).toBeNull();
        expect(await lola.query(anyApi.veilleAteliers.list)).toHaveLength(1);
        await expect(marie.query(anyApi.veilleAteliers.list)).rejects.toThrow('stagiaire');
    });
});

describe('Documentaires et vidéos', () => {
    it('reconnaît les plateformes et les vidéos YouTube', () => {
        expect(platformOf('https://www.arte.tv/fr/videos/123/')).toBe('arte');
        expect(platformOf('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
        expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
        expect(youtubeId('https://www.arte.tv/fr/videos/123/')).toBeNull();
        const v = normalizeVideo({ title: 'Lesage', url: 'https://www.ina.fr/video/x', kind: 'film', year: 'vers 1990', forCap: 'oui' })!;
        expect(v).toMatchObject({ platform: 'ina', kind: 'reportage', year: '', forCap: false, language: 'fr' });
        expect(videoError(v)).toBeNull();
        expect(normalizeVideo({ title: 'Sans lien' })).toBeNull();
    });

    it('s’importe sans doublon et se partage avec les stagiaires', async () => {
        const { t, lola } = await setup();
        const list = [{ title: 'Le crochet de Lunéville', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', forCap: true }, { title: 'Doublon', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }, { title: 'RSN', url: 'https://vimeo.com/1', language: 'en' }];
        expect(await t.mutation(anyApi.veilleVideos.importVideos, { json: JSON.stringify(list) })).toEqual({ found: 3, added: 2 });
        expect(await t.mutation(anyApi.veilleVideos.importVideos, { json: JSON.stringify(list) })).toEqual({ found: 3, added: 0 });
        expect((await lola.query(anyApi.veilleVideos.list)).map((v: { title: string }) => v.title).sort()).toEqual(['Le crochet de Lunéville', 'RSN']);
    });
});

describe('Moteur de l’agent', () => {
    it('prend Exa quand sa clé est là, sinon OpenRouter', async () => {
        const { lola } = await setup();
        expect(await lola.query(anyApi.veille.agentStatus)).toMatchObject({ available: false });
        vi.stubEnv('OPENROUTER_API_KEY', 'or');
        expect(await lola.query(anyApi.veille.agentStatus)).toMatchObject({ available: true, model: 'anthropic/claude-haiku-5.5' });
        vi.stubEnv('EXA_API_KEY', 'exa'); vi.stubEnv('EXA_EFFORT', 'high');
        expect(await lola.query(anyApi.veille.agentStatus)).toMatchObject({ available: true, model: 'exa/agent-high' });
    });
});
