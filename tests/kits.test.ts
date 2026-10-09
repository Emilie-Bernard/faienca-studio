import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyKit, kitError, localizeKit, localizeLesson, normalizeCode, videoSource, type KitInput } from '../lib/kits';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

const lesson = (id: string, stitch = 'Point de tige') => ({ id, title: 'Leçon ' + id, stitch, videoUrl: 'https://youtu.be/abc', notes: '' });
const kit = (patch: Partial<KitInput> = {}): KitInput => ({ ...emptyKit(), title: 'Kit Olivier', accessCode: 'OLIVE-24', published: true, lessons: [lesson('a'), lesson('b', 'Point de nœud')], ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (doc: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', doc)); return { id, api: t.withIdentity({ subject: id + '|session' }) }; };
    const atelier = await as({ githubId: '123' });
    const marie = await as({ email: 'marie@example.com', name: 'Marie Dupont', role: 'cliente' });
    const lea = await as({ email: 'lea@example.com', name: 'Léa', role: 'cliente' });
    return { t, as, atelier, marie, lea };
}

describe('Rôles', () => {
    it('donne le rôle admin au compte atelier et cliente par défaut', async () => {
        const { atelier, marie, as } = await setup();
        expect((await atelier.api.query(anyApi.users.me)).role).toBe('admin');
        expect((await marie.api.query(anyApi.users.me)).role).toBe('cliente');
        expect((await (await as({ email: 'x@example.com' })).api.query(anyApi.users.me)).role).toBe('cliente');
    });
    it('réserve l’atelier et la gestion des kits aux admins', async () => {
        const { marie } = await setup();
        for (const fn of [anyApi.studio.list, anyApi.kits.adminList, anyApi.kits.adminQuestions, anyApi.users.list]) await expect(marie.api.query(fn)).rejects.toThrow('propriétaire');
        await expect(marie.api.mutation(anyApi.kits.saveKit, { data: kit() })).rejects.toThrow('propriétaire');
        await expect(marie.api.mutation(anyApi.kits.generateUploadUrl)).rejects.toThrow('propriétaire');
    });
    it('permet de promouvoir une cliente, mais pas de toucher à son propre rôle ni au compte atelier', async () => {
        const { atelier, marie } = await setup();
        await expect(marie.api.mutation(anyApi.users.setRole, { userId: marie.id, role: 'admin' })).rejects.toThrow('propriétaire');
        await atelier.api.mutation(anyApi.users.setRole, { userId: marie.id, role: 'admin' });
        expect(await marie.api.query(anyApi.studio.list)).toEqual([]);
        await expect(marie.api.mutation(anyApi.users.setRole, { userId: atelier.id, role: 'cliente' })).rejects.toThrow('atelier');
        await expect(atelier.api.mutation(anyApi.users.setRole, { userId: atelier.id, role: 'cliente' })).rejects.toThrow('propre rôle');
    });
});

describe('Kits et progression', () => {
    it('active un kit publié avec son code, sans tenir compte de la casse ni des tirets', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit() });
        const hidden = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ title: 'Brouillon', published: false }) });
        const catalog = await marie.api.query(anyApi.kits.catalog);
        expect(catalog.map((k: { title: string }) => k.title)).toEqual(['Kit Olivier']);
        expect(catalog[0]).not.toHaveProperty('accessCode');
        expect(catalog[0]).not.toHaveProperty('lessons');
        await expect(marie.api.mutation(anyApi.kits.activate, { kitId: hidden, code: '' })).rejects.toThrow('introuvable');
        await expect(marie.api.mutation(anyApi.kits.activate, { kitId, code: 'FAUX' })).rejects.toThrow('code');
        await expect(marie.api.query(anyApi.kits.questions, { kitId })).rejects.toThrow('Activez');
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: ' olive 24 ' });
        const [mine] = await marie.api.query(anyApi.kits.mine);
        expect(mine.kit.lessons).toHaveLength(2);
        expect(mine.kit).not.toHaveProperty('accessCode');
    });
    it('suit les leçons brodées et date la fin de l’ouvrage', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ accessCode: '' }) });
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        await marie.api.mutation(anyApi.kits.setLesson, { kitId, lessonId: 'a', done: true });
        expect((await marie.api.query(anyApi.kits.mine))[0].progress).toMatchObject({ completed: ['a'], finishedAt: null });
        await marie.api.mutation(anyApi.kits.setLesson, { kitId, lessonId: 'b', done: true });
        expect((await marie.api.query(anyApi.kits.mine))[0].progress.finishedAt).toEqual(expect.any(Number));
        await marie.api.mutation(anyApi.kits.setLesson, { kitId, lessonId: 'b', done: false });
        expect((await marie.api.query(anyApi.kits.mine))[0].progress).toMatchObject({ completed: ['a'], finishedAt: null });
        await expect(marie.api.mutation(anyApi.kits.setLesson, { kitId, lessonId: 'inconnue', done: true })).rejects.toThrow('Leçon');
        await marie.api.mutation(anyApi.kits.saveNotes, { kitId, notes: 'DMC 3363' });
        expect((await marie.api.query(anyApi.kits.mine))[0].progress.notes).toBe('DMC 3363');
    });
    it('masque un kit dépublié et refuse un enregistrement concurrent', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ accessCode: '' }) });
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        await atelier.api.mutation(anyApi.kits.saveKit, { id: kitId, revision: 1, data: kit({ published: false }) });
        expect(await marie.api.query(anyApi.kits.mine)).toEqual([]);
        await expect(marie.api.mutation(anyApi.kits.setLesson, { kitId, lessonId: 'a', done: true })).rejects.toThrow('Activez');
        await expect(atelier.api.mutation(anyApi.kits.saveKit, { id: kitId, revision: 1, data: kit() })).rejects.toThrow('autre session');
    });
    it('supprime la progression et les questions avec le kit', async () => {
        const { t, atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ accessCode: '' }) });
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        await marie.api.mutation(anyApi.kits.ask, { kitId, lessonId: 'a', body: 'Quelle aiguille ?' });
        await atelier.api.mutation(anyApi.kits.removeKit, { id: kitId, revision: 1 });
        expect(await t.run(async ctx => [...await ctx.db.query('kitProgress').collect(), ...await ctx.db.query('kitQuestions').collect()])).toEqual([]);
    });
});

describe('Traductions des kits', () => {
    it('enregistre les traductions et les renvoie aux clientes', async () => {
        const { atelier, marie } = await setup();
        const translated = kit({
            accessCode: '', translations: { en: { title: 'Olive tree kit', description: '' } },
            lessons: [{ ...lesson('a'), translations: { en: { title: 'The outline', stitch: 'Stem stitch', notes: '' }, es: { title: 'El contorno', stitch: '', notes: '' } } }, lesson('b', 'Point de nœud')],
        });
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: translated });
        const [entry] = await marie.api.query(anyApi.kits.catalog);
        expect(entry.translations.en.title).toBe('Olive tree kit');
        expect(entry.stitchTranslations.en).toEqual(['Stem stitch', 'Point de nœud']);
        expect(entry.stitchTranslations.es).toEqual(['Point de tige', 'Point de nœud']);
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        const [mine] = await marie.api.query(anyApi.kits.mine);
        expect(localizeKit(mine.kit, 'en').title).toBe('Olive tree kit');
        expect(localizeLesson(mine.kit.lessons[0], 'es').title).toBe('El contorno');
    });
    it('reprend le français pour un champ vide ou une langue sans traduction', () => {
        const l = { ...lesson('a'), notes: 'Tirez doucement.', translations: { en: { title: 'The outline', stitch: '  ', notes: '' } } };
        expect(localizeLesson(l, 'en')).toMatchObject({ title: 'The outline', stitch: 'Point de tige', notes: 'Tirez doucement.' });
        expect(localizeLesson(l, 'es')).toMatchObject({ title: 'Leçon a', stitch: 'Point de tige' });
        expect(localizeLesson(l, 'fr').title).toBe('Leçon a');
        expect(kitError(kit({ translations: { es: { title: 'x'.repeat(201), description: '' } } }))).toMatch('traduction');
    });
});

describe('Questions et réponses', () => {
    it('montre les réponses à toutes les clientes du kit et garde les questions en attente privées', async () => {
        const { atelier, marie, lea } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ accessCode: '' }) });
        for (const u of [marie, lea]) await u.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        const q1 = await marie.api.mutation(anyApi.kits.ask, { kitId, lessonId: 'a', body: 'Combien de brins pour la tige ?' });
        await lea.api.mutation(anyApi.kits.ask, { kitId, lessonId: '', body: 'Le tambour est-il fourni ?' });
        expect((await lea.api.query(anyApi.kits.questions, { kitId })).map((q: { body: string }) => q.body)).toEqual(['Le tambour est-il fourni ?']);
        expect(await atelier.api.query(anyApi.kits.adminQuestions)).toHaveLength(2);
        await atelier.api.mutation(anyApi.kits.answer, { id: q1, answer: 'Deux brins.' });
        const seen = await lea.api.query(anyApi.kits.questions, { kitId });
        expect(seen.find((q: { answer: string | null }) => q.answer)).toMatchObject({ authorName: 'Marie', answer: 'Deux brins.', mine: false });
        await expect(lea.api.mutation(anyApi.kits.removeQuestion, { id: q1 })).rejects.toThrow('sans réponse');
        await expect(marie.api.mutation(anyApi.kits.removeQuestion, { id: q1 })).rejects.toThrow('sans réponse');
    });
    it('refuse les questions vides, trop longues ou sur une leçon inconnue', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ accessCode: '' }) });
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: '' });
        for (const args of [{ lessonId: '', body: '  ' }, { lessonId: '', body: 'x'.repeat(2001) }, { lessonId: 'zzz', body: 'Une question ?' }]) await expect(marie.api.mutation(anyApi.kits.ask, { kitId, ...args })).rejects.toThrow();
    });
});

describe('Validation et vidéos', () => {
    it('valide les kits', () => {
        expect(kitError(kit())).toBeNull();
        expect(kitError(kit({ title: ' ' }))).toMatch('titre');
        expect(kitError(kit({ coverUrl: 'javascript:alert(1)' }))).toMatch('https');
        expect(kitError(kit({ lessons: [{ ...lesson('a'), videoUrl: 'http://exemple.fr/v.mp4' }] }))).toMatch('https');
        expect(kitError(kit({ lessons: [lesson('a'), lesson('a')] }))).toMatch('dupliqués');
        expect(normalizeCode(' olive-24 ')).toBe('OLIVE24');
    });
    it('convertit les liens YouTube, Vimeo et fichiers vidéo', () => {
        const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0';
        for (const url of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ']) expect(videoSource(url)).toEqual({ type: 'iframe', src: yt });
        expect(videoSource('https://vimeo.com/123456/abcdef')).toEqual({ type: 'iframe', src: 'https://player.vimeo.com/video/123456?h=abcdef' });
        expect(videoSource('https://cdn.exemple.fr/point.mp4')).toEqual({ type: 'video', src: 'https://cdn.exemple.fr/point.mp4' });
        expect(videoSource('http://youtu.be/abc')).toBeNull();
        expect(videoSource('https://exemple.fr/page')).toBeNull();
    });
});
