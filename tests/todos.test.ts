import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyEntry } from '../lib/model';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

async function setup() {
    const t = convexTest(schema, modules);
    const id = await t.run(ctx => ctx.db.insert('users', { githubId: '123' }));
    const cliente = await t.run(ctx => ctx.db.insert('users', { email: 'marie@example.com', role: 'cliente' }));
    return { t, api: t.withIdentity({ subject: id + '|session' }), cliente: t.withIdentity({ subject: cliente + '|session' }) };
}

describe('To-do du jour', () => {
    it('limite la journée à 5 tâches, terminées comprises', async () => {
        const { api } = await setup();
        for (let i = 1; i <= 5; i++) await api.mutation(anyApi.todos.add, { title: 'Tâche ' + i, today: '2026-10-09' });
        await expect(api.mutation(anyApi.todos.add, { title: 'Une de trop', today: '2026-10-09' })).rejects.toThrow('5 tâches maximum');
        const [first] = await api.query(anyApi.todos.today, { today: '2026-10-09' });
        await api.mutation(anyApi.todos.toggle, { id: first._id, today: '2026-10-09' });
        await expect(api.mutation(anyApi.todos.add, { title: 'Toujours de trop', today: '2026-10-09' })).rejects.toThrow('5 tâches maximum');
    });
    it('reporte les tâches non terminées au lendemain', async () => {
        const { api } = await setup();
        const a = await api.mutation(anyApi.todos.add, { title: 'Photo du kit', today: '2026-10-09' });
        await api.mutation(anyApi.todos.add, { title: 'Newsletter', today: '2026-10-09' });
        await api.mutation(anyApi.todos.toggle, { id: a, today: '2026-10-09' });
        const tomorrow = await api.query(anyApi.todos.today, { today: '2026-10-10' });
        expect(tomorrow.map((t: { title: string }) => t.title)).toEqual(['Newsletter']);
        expect(tomorrow[0].day).toBe('2026-10-09');
        expect(await api.query(anyApi.todos.today, { today: '2026-10-08' })).toEqual([]);
    });
    it('est réservée à la propriétaire', async () => {
        const { cliente } = await setup();
        await expect(cliente.query(anyApi.todos.today, { today: '2026-10-09' })).rejects.toThrow('propriétaire');
    });
    it('remplit la journée avec ce qui est urgent, sans reproposer une tâche retirée', async () => {
        const { t, api } = await setup();
        const entry = (patch: Record<string, unknown>) => t.run(ctx => ctx.db.insert('entries', { ...emptyEntry(patch.kind as never), ...patch, revision: 1 } as never));
        await entry({ kind: 'publication', title: 'Reel cigale', status: 'À préparer', date: '2026-10-08' });
        await entry({ kind: 'publication', title: 'Déjà programmé', status: 'Programmé', date: '2026-10-09' });
        await entry({ kind: 'publication', title: 'Dans un mois', status: 'À préparer', date: '2026-11-09' });
        await entry({ kind: 'projet', title: 'Kit Noël', status: 'En cours', priority: 'Haute', tasks: [{ id: 'a', title: 'Fini', done: true }, { id: 'b', title: 'Choisir les fils', done: false }] });
        await entry({ kind: 'projet', title: 'Un jour peut-être', status: 'À envisager', tasks: [{ id: 'c', title: 'Rêver', done: false }] });
        await api.mutation(anyApi.todos.add, { title: 'Tâche perso', today: '2026-10-09' });
        const { added } = await api.mutation(anyApi.todos.fillNow, { today: '2026-10-09' });
        expect(added).toEqual(['Finaliser « Reel cigale » (en retard)', 'Kit Noël — Choisir les fils']);
        expect((await api.mutation(anyApi.todos.fillNow, { today: '2026-10-09' })).added).toEqual([]);
        const list = await api.query(anyApi.todos.today, { today: '2026-10-09' });
        await api.mutation(anyApi.todos.remove, { id: list.find((x: { title: string }) => x.title.startsWith('Kit Noël'))._id });
        expect((await api.mutation(anyApi.todos.fillNow, { today: '2026-10-10' })).added).toEqual([]);
        expect((await api.query(anyApi.todos.today, { today: '2026-10-10' })).map((x: { title: string }) => x.title)).toEqual(['Tâche perso', 'Finaliser « Reel cigale » (en retard)']);
    });
});
