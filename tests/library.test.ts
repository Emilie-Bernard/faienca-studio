import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { groupByCategory, libraryError } from '../lib/library';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

const doc = (patch: Record<string, unknown> = {}) => ({ title: 'Guide des points', category: 'Techniques', description: '', file: { id: 'f1', label: 'Guide des points', url: 'https://exemple.fr/guide' }, ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (u: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', u)); return { id, api: t.withIdentity({ subject: id + '|session' }) }; };
    return { atelier: await as({ githubId: '123' }), lola: await as({ name: 'Lola', role: 'stagiaire' }), zoe: await as({ name: 'Zoé', role: 'stagiaire' }), marie: await as({ name: 'Marie', role: 'cliente' }) };
}

describe('Bibliothèque', () => {
    it('valide les documents et les range par catégorie', () => {
        expect(libraryError(doc())).toBeNull();
        expect(libraryError(doc({ title: ' ' }))).toMatch('titre');
        expect(libraryError(doc({ file: { id: 'f', label: 'x', url: 'http://x.fr' } }))).toMatch('https');
        expect(groupByCategory([{ category: '' }, { category: 'Zèbre' }, { category: 'Art' }]).map(g => g.category)).toEqual(['Art', 'Zèbre', 'Divers']);
    });

    it('est partagée entre l’atelier et les stagiaires, pas avec les clientes', async () => {
        const { atelier, lola, zoe, marie } = await setup();
        await atelier.api.mutation(anyApi.library.add, doc());
        await lola.api.mutation(anyApi.library.add, doc({ title: 'Mes photos', file: { id: 'f2', label: 'Mes photos', url: 'https://exemple.fr/photos' } }));
        const seen = await zoe.api.query(anyApi.library.list);
        expect(seen.map((d: { title: string }) => d.title).sort()).toEqual(['Guide des points', 'Mes photos']);
        expect(seen.find((d: { authorName: string }) => d.authorName === 'Lola')).toBeTruthy();
        await expect(marie.api.query(anyApi.library.list)).rejects.toThrow('stagiaire');
        await expect(marie.api.mutation(anyApi.library.add, doc())).rejects.toThrow('stagiaire');
    });

    it('laisse retirer ses propres documents, et tout pour l’atelier', async () => {
        const { atelier, lola, zoe } = await setup();
        const fromAtelier = await atelier.api.mutation(anyApi.library.add, doc());
        const fromLola = await lola.api.mutation(anyApi.library.add, doc({ title: 'Mes photos' }));
        expect((await zoe.api.query(anyApi.library.list)).every((d: { canRemove: boolean }) => !d.canRemove)).toBe(true);
        await expect(zoe.api.mutation(anyApi.library.remove, { id: fromLola })).rejects.toThrow('ajouté');
        await expect(lola.api.mutation(anyApi.library.remove, { id: fromAtelier })).rejects.toThrow('ajouté');
        await lola.api.mutation(anyApi.library.remove, { id: fromLola });
        await atelier.api.mutation(anyApi.library.remove, { id: fromAtelier });
        expect(await lola.api.query(anyApi.library.list)).toEqual([]);
    });
});
