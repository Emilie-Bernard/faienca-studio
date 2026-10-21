import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { competitorError, emptyCompetitor, euros, followersFr, mergeCompetitor, normalizeCompetitor } from '../lib/veille';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.stubEnv('OWNER_GITHUB_ID', '123'); });

let n = 0;
const id = () => 'id' + n++;

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (u: Record<string, unknown>) => { const uid = await t.run(ctx => ctx.db.insert('users', u)); return t.withIdentity({ subject: uid + '|session' }); };
    return { t, atelier: await as({ githubId: '123' }), lola: await as({ name: 'Lola', role: 'stagiaire' }) };
}

describe('Concurrentes', () => {
    it('met en forme les chiffres, les produits et les audiences trouvés', () => {
        const c = normalizeCompetitor({
            name: 'Brodeuse Test', country: 'Espagne', foundedDate: '2016',
            financials: [{ year: '2022', revenue: '120 000 €', netIncome: null, employees: 2 }, { year: '2023', revenue: '1,2 M€' }, { year: '2023', revenue: 5 }, { year: 'vers 2020', revenue: 1 }],
            products: [{ title: 'Kit Coquelicots', format: 'kit', price: 39, bestseller: true }, { title: 'kit coquelicots' }, { title: 'Patron Fougère', format: 'Patron PDF' }],
            audience: [{ platform: 'Instagram', followers: '45k', date: '2026-10' }],
        }, id);
        expect(c.financials.map(f => [f.year, f.revenue, f.employees])).toEqual([['2023', 1200000, ''], ['2022', 120000, '2']]);
        expect(c.products.map(p => [p.title, p.format, p.price, p.bestseller])).toEqual([['Kit Coquelicots', 'kit', '39 €', true], ['Patron Fougère', 'pdf', '', false]]);
        expect(c.audience[0]).toMatchObject({ platform: 'Instagram', followers: 45000 });
        expect(competitorError(c)).toBeNull();
        expect(competitorError({ ...emptyCompetitor('X'), financials: [{ id: id(), year: '23', revenue: 1, netIncome: null, employees: '', source: '' }] })).toMatch('AAAA');
        expect([euros(185000), euros(1234567), euros(null), followersFr(45300), followersFr(812)].map(s => s.replace(/\s/g, ' '))).toEqual(['185 000 €', '1,2 M€', '', '45,3 k', '812']);
    });

    it('complète une fiche sans effacer ni dupliquer', () => {
        const current = normalizeCompetitor({ name: 'A', country: 'Espagne', financials: [{ year: '2023', revenue: 100 }], audience: [{ platform: 'Instagram', followers: 10, date: '2025-01' }], products: [{ title: 'Kit Lune', format: 'kit' }] }, id);
        // Un deuxième envoi de l'import n'a que le nom et une liste : le pays ne doit pas repasser à « France ».
        const found = normalizeCompetitor({ name: 'A', financials: [{ year: '2023', revenue: 999, netIncome: 20 }, { year: '2024', revenue: 150 }], audience: [{ platform: 'instagram', followers: 30, date: '2026-10' }], products: [{ title: 'kit lune', imageUrl: 'https://x.fr/lune.jpg', bestseller: true }] }, id);
        const merged = mergeCompetitor(current, found);
        expect(merged.country).toBe('Espagne');
        expect(merged.financials.map(f => [f.year, f.revenue, f.netIncome])).toEqual([['2024', 150, null], ['2023', 100, 20]]);
        expect(merged.audience.map(a => [a.platform, a.followers])).toEqual([['Instagram', 30]]);
        expect(merged.products).toHaveLength(1);
        expect(merged.products[0]).toMatchObject({ title: 'Kit Lune', imageUrl: 'https://x.fr/lune.jpg', bestseller: true });
    });

    it('s’importe sans doublon et reste réservée à l’atelier', async () => {
        const { t, atelier, lola } = await setup();
        const json = JSON.stringify({ name: 'Un Chat dans l’Aiguille', country: 'France', foundedDate: '2015', offers: ['Kits de broderie'], threads: ['DMC Mouliné spécial 25'], financials: [{ year: '2023', revenue: 300000 }], audience: [{ platform: 'Instagram', followers: 90000 }], products: [{ title: 'Kit Botanique', imageUrl: 'https://x.fr/b.jpg', bestseller: true }] });
        const first = await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json });
        const again = await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json: JSON.stringify({ name: 'un chat dans l aiguille', threads: ['Anchor'] }) });
        expect(first.created).toBe(true);
        expect(again).toEqual({ id: first.id, created: false });
        const [row] = await atelier.query(anyApi.veilleConcurrentes.list);
        expect(row).toMatchObject({ name: 'Un Chat dans l’Aiguille', threads: ['DMC Mouliné spécial 25', 'Anchor'], revenue: { year: '2023', amount: 300000 }, instagram: 90000, products: 1, cover: 'https://x.fr/b.jpg' });
        await expect(atelier.mutation(anyApi.veilleConcurrentes.save, { data: emptyCompetitor('Un chat dans l’aiguille') })).rejects.toThrow('déjà');
        await expect(lola.query(anyApi.veilleConcurrentes.list)).rejects.toThrow('propriétaire');
    });

    it('ne garde pas le numéro d’identité d’une personne, mais garde celui d’une société', () => {
        const autonoma = normalizeCompetitor({ name: 'Autónoma', registrationId: '24269752Z', researchNotes: 'NIF ES02282105E sur l’aviso legal ; NIE X1234567L.' }, id);
        expect(autonoma.registrationId).toBe('');
        expect(autonoma.researchNotes).not.toMatch(/24269752Z|02282105E|X1234567L/);
        expect(normalizeCompetitor({ name: 'Société', registrationId: 'B21755749' }, id).registrationId).toBe('B21755749');
        expect(normalizeCompetitor({ name: 'SAS', registrationId: '890386915' }, id).registrationId).toBe('890386915');
        // Une fiche importée avant le filtre est nettoyée au prochain import.
        const old = { ...emptyCompetitor('Ancienne'), registrationId: '71646297D', researchNotes: 'NIF 71646297D.' };
        const merged = mergeCompetitor(old, normalizeCompetitor({ name: 'Ancienne' }, id));
        expect([merged.registrationId, merged.researchNotes]).toEqual(['', 'NIF [numéro personnel retiré].']);
    });

    it('ne recrée pas à l’import une concurrente que l’atelier a supprimée, sauf si elle la rajoute', async () => {
        const { t, atelier } = await setup();
        const json = JSON.stringify({ name: 'B comme Broderie', country: 'France' });
        const first = await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json }) as { id: string, created: boolean };
        expect(first.created).toBe(true);
        await atelier.mutation(anyApi.veilleConcurrentes.remove, { id: first.id });
        expect(await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json: JSON.stringify({ name: 'b comme broderie' }) })).toMatchObject({ created: false, removed: true });
        expect(await atelier.query(anyApi.veilleConcurrentes.list)).toHaveLength(0);
        // Rajoutée à la main, l'import la complète de nouveau.
        await atelier.mutation(anyApi.veilleConcurrentes.save, { data: emptyCompetitor('B comme Broderie') });
        expect(await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json })).toMatchObject({ created: false });
        expect(await atelier.query(anyApi.veilleConcurrentes.list)).toHaveLength(1);
    });

    it('classe une concurrente, garde le classement après une modification ou un import, et le retire', async () => {
        const { t, atelier, lola } = await setup();
        const id = await atelier.mutation(anyApi.veilleConcurrentes.save, { data: emptyCompetitor('Marque Proche') });
        const relevance = async () => (await atelier.query(anyApi.veilleConcurrentes.list) as { relevance: string | null }[])[0].relevance;
        expect(await relevance()).toBeNull();
        await atelier.mutation(anyApi.veilleConcurrentes.setRelevance, { id, relevance: 'proche' });
        await atelier.mutation(anyApi.veilleConcurrentes.save, { id, data: { ...emptyCompetitor('Marque Proche'), city: 'Lyon' } });
        await t.mutation(anyApi.veilleConcurrentes.importCompetitor, { json: JSON.stringify({ name: 'marque proche', threads: ['DMC'] }) });
        expect(await relevance()).toBe('proche');
        await atelier.mutation(anyApi.veilleConcurrentes.setRelevance, { id, relevance: 'loin' });
        expect(await relevance()).toBe('loin');
        await atelier.mutation(anyApi.veilleConcurrentes.setRelevance, { id, relevance: null });
        expect(await relevance()).toBeNull();
        await expect(lola.mutation(anyApi.veilleConcurrentes.setRelevance, { id, relevance: 'proche' })).rejects.toThrow('propriétaire');
    });
});
