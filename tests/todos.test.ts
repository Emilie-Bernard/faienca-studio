import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

async function setup() {
    const t = convexTest(schema, modules);
    const id = await t.run(ctx => ctx.db.insert('users', { githubId: '123' }));
    const cliente = await t.run(ctx => ctx.db.insert('users', { email: 'marie@example.com', role: 'cliente' }));
    return { api: t.withIdentity({ subject: id + '|session' }), cliente: t.withIdentity({ subject: cliente + '|session' }) };
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
});
