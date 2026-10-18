import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { expenseError, expensesCsv, yearSummary, yearsOf } from '../lib/expenses';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

const expense = (patch: Record<string, unknown> = {}) => ({ date: '2026-03-14', supplier: 'DMC', label: 'Fils', category: 'Matériel et fournitures', amount: 24.9, notes: '', ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (u: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', u)); return t.withIdentity({ subject: id + '|session' }); };
    return { atelier: await as({ githubId: '123' }), lola: await as({ name: 'Lola', role: 'stagiaire' }) };
}

describe('Dépenses', () => {
    it('valide les dépenses', () => {
        expect(expenseError(expense())).toBeNull();
        expect(expenseError(expense({ date: '2026-02-30' }))).toMatch('date');
        expect(expenseError(expense({ supplier: ' ' }))).toMatch('fournisseur');
        expect(expenseError(expense({ amount: 0 }))).toMatch('montant');
        expect(expenseError(expense({ amount: null }))).toMatch('montant');
        expect(expenseError(expense({ category: 'Voyage' }))).toMatch('Catégorie');
    });

    it('fait les totaux de l’année, par mois et par catégorie', () => {
        const rows = [expense({ amount: 0.1 }), expense({ amount: 0.2 }), expense({ date: '2026-11-02', category: 'Impression', amount: 50 }), expense({ date: '2025-12-31', amount: 999 })];
        const s = yearSummary(rows as { date: string, category: string, amount: number }[], '2026');
        expect(s.total).toBe(50.3);
        expect(s.count).toBe(3);
        expect(s.months[2]).toBe(0.3);
        expect(s.months[10]).toBe(50);
        expect(s.categories.map(c => c.category)).toEqual(['Impression', 'Matériel et fournitures']);
        expect(yearsOf(rows, '2026')).toEqual(['2026', '2025']);
    });

    it('exporte un CSV lisible par Excel en français', () => {
        const csv = expensesCsv([expense({ label: 'Fils; lot "printemps"' }) as never]);
        expect(csv.split('\n')[1]).toBe('2026-03-14;DMC;"Fils; lot ""printemps""";Matériel et fournitures;24,90;');
    });

    it('est réservée à l’administratrice', async () => {
        const { atelier, lola } = await setup();
        const id = await atelier.mutation(anyApi.expenses.save, { data: expense({ amount: 12.345, supplier: '  Shopify ' }) });
        const [row] = await atelier.query(anyApi.expenses.list);
        expect(row).toMatchObject({ supplier: 'Shopify', amount: 12.35 });
        await atelier.mutation(anyApi.expenses.save, { id, data: expense({ amount: 30 }) });
        expect((await atelier.query(anyApi.expenses.list))[0].amount).toBe(30);
        await expect(lola.query(anyApi.expenses.list)).rejects.toThrow('propriétaire');
        await expect(lola.mutation(anyApi.expenses.save, { data: expense() })).rejects.toThrow('propriétaire');
        await atelier.mutation(anyApi.expenses.remove, { id });
        expect(await atelier.query(anyApi.expenses.list)).toEqual([]);
    });
});
