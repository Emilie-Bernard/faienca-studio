import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { costSummary, duplicateProduct, emptyProduct, isDefaultChecklist, launchChecklist, newMaterial, productError, taskProgress, type ProductInput } from '../lib/products';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

const product = (patch: Partial<ProductInput> = {}): ProductInput => ({ ...emptyProduct('kit'), title: 'Kit Citron', ...patch });
const material = (patch = {}) => ({ ...newMaterial(), name: 'Fil DMC', unitCost: 2, ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (doc: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', doc)); return t.withIdentity({ subject: id + '|session' }); };
    return { t, atelier: await as({ githubId: '123' }), marie: await as({ email: 'marie@example.com', role: 'cliente' }), lola: await as({ email: 'lola@example.com', role: 'stagiaire' }) };
}

describe('Validation des produits', () => {
    it('propose une checklist de départ selon le type', () => {
        expect(launchChecklist('kit').length).toBeGreaterThan(8);
        expect(launchChecklist('pdf').some(t => t.title.includes('anglais'))).toBe(true);
        expect(productError(product())).toBeNull();
    });
    it('exige des liens d’achat https et des prix valides', () => {
        const link = (url: string) => ({ id: 'l', shop: 'Mercerie', url, note: '' });
        expect(productError(product({ materials: [material({ links: [link('https://shop.fr/fil')] })] }))).toBeNull();
        expect(productError(product({ materials: [material({ links: [link('http://shop.fr')] })] }))).toMatch('https');
        expect(productError(product({ materials: [material({ links: [link('javascript:alert(1)')] })] }))).toMatch('https');
        expect(productError(product({ materials: [material({ unitCost: -1 })] }))).toMatch('coût');
        expect(productError(product({ price: -5 }))).toMatch('prix');
        expect(productError(product({ title: ' ' }))).toMatch('titre');
        expect(productError(product({ pdfs: { fr: { id: 'a', label: '', url: 'http://x.fr/a.pdf' } } }))).toMatch('Français');
    });
    it('calcule le coût des matières du kit, sans les outils de l’atelier', () => {
        const materials = [material({ unitCost: 2.5 }), material({ id: 'b', unitCost: 1.5 }), material({ id: 'c', purpose: 'atelier', unitCost: 40 }), material({ id: 'd', unitCost: null })];
        expect(costSummary({ materials, price: 24 })).toMatchObject({ cost: 4, missing: 1, margin: 20, marginPercent: 83 });
        expect(costSummary({ materials, price: null }).margin).toBeNull();
        expect(taskProgress([{ done: true }, { done: false }])).toEqual({ done: 1, total: 2 });
    });
});

describe('Produits (backend)', () => {
    it('est réservé à l’administratrice', async () => {
        const { atelier, marie, lola } = await setup();
        for (const api of [marie, lola]) {
            await expect(api.query(anyApi.products.list)).rejects.toThrow('propriétaire');
            await expect(api.mutation(anyApi.products.save, { data: product() })).rejects.toThrow('propriétaire');
            await expect(api.mutation(anyApi.products.generateUploadUrl)).rejects.toThrow('propriétaire');
        }
        expect(await atelier.query(anyApi.products.list)).toEqual([]);
    });
    it('enregistre contenu, matériaux avec liens, PDF et tâches, puis les relit', async () => {
        const { atelier } = await setup();
        const data = product({
            price: 29, contents: [{ id: 'c1', name: 'Toile imprimée', notes: '' }],
            materials: [material({ links: [{ id: 'l1', shop: 'Mercerie du Sud', url: 'https://mercerie.example/fil', note: 'lot de 10' }] })],
            pdfs: { fr: { id: 'p1', label: 'Notice FR', url: 'https://example.com/fr.pdf' }, en: { id: 'p2', label: 'Notice EN', url: 'https://example.com/en.pdf' } },
        });
        const id = await atelier.mutation(anyApi.products.save, { data });
        const [row] = await atelier.query(anyApi.products.list);
        expect(row._id).toBe(id);
        expect(row.materials[0].links[0].url).toBe('https://mercerie.example/fil');
        expect(Object.keys(row.pdfs).sort()).toEqual(['en', 'fr']);
        expect(row.pdfs.fr.fileUrl).toBeNull();
        expect(row.tasks.length).toBeGreaterThan(8);
    });
    it('refuse un produit invalide ou une modification concurrente, et supprime', async () => {
        const { atelier } = await setup();
        await expect(atelier.mutation(anyApi.products.save, { data: product({ shopUrl: 'http://x.fr' }) })).rejects.toThrow('https');
        const id = await atelier.mutation(anyApi.products.save, { data: product() });
        await atelier.mutation(anyApi.products.save, { id, revision: 1, data: product({ status: 'Prototype' }) });
        await expect(atelier.mutation(anyApi.products.save, { id, revision: 1, data: product() })).rejects.toThrow('autre session');
        await expect(atelier.mutation(anyApi.products.remove, { id, revision: 1 })).rejects.toThrow('changé');
        await atelier.mutation(anyApi.products.remove, { id, revision: 2 });
        expect(await atelier.query(anyApi.products.list)).toEqual([]);
    });
});

describe('Duplication et import', () => {
    it('duplique sans fichiers téléversés, sans achats cochés ni lien boutique', () => {
        const source = product({
            title: 'Kit Citron', status: 'En vente', shopUrl: 'https://boutique.example/citron', linkedKitId: 'k1',
            materials: [material({ bought: true, links: [{ id: 'l', shop: 'M', url: 'https://m.example', note: '' }] })],
            tasks: [{ id: 't', title: 'Fait', done: true }],
            pdfs: { fr: { id: 'a', label: 'Lien', url: 'https://x.example/a.pdf' }, en: { id: 'b', label: 'Fichier', url: '', storageId: 's1' } },
        });
        const copy = duplicateProduct(source);
        expect(copy).toMatchObject({ title: 'Kit Citron (copie)', status: 'Idée', shopUrl: '', linkedKitId: '' });
        expect(Object.keys(copy.pdfs)).toEqual(['fr']);
        expect(copy.materials[0]).toMatchObject({ bought: false, name: 'Fil DMC' });
        expect(copy.materials[0]!.id).not.toBe(source.materials[0]!.id);
        expect(copy.materials[0]!.links[0]!.id).not.toBe('l');
        expect(copy.tasks[0]).toMatchObject({ title: 'Fait', done: false });
        expect(productError(copy)).toBeNull();
    });
    it('reconnaît la checklist de départ pour changer de type sans perdre un travail déjà fait', () => {
        expect(isDefaultChecklist(launchChecklist('kit'), 'kit')).toBe(true);
        expect(isDefaultChecklist(launchChecklist('kit'), 'pdf')).toBe(false);
        expect(isDefaultChecklist([{ id: 'a', title: 'Valider le motif et le niveau visé', done: true }], 'kit')).toBe(false);
    });
    it('importe sans doublon et relie un kit d’espace brodeuses quand un seul titre correspond', async () => {
        const { t, atelier } = await setup();
        const kitId = await atelier.mutation(anyApi.kits.saveKit, { data: { title: 'Citron brodé', description: '', coverUrl: '', accessCode: '', published: true, lessons: [] } });
        const batch = { products: [{ type: 'kit', title: 'Kit Citron', motif: 'Citron' }, { type: 'pdf', title: 'PDF Citron' }, { type: 'kit', title: 'Kit Cigale', motif: 'Cigale' }] };
        const first = await t.mutation(anyApi.products.importDrafts as never, batch as never) as { created: string[] };
        expect(first.created).toHaveLength(3);
        const rows = await atelier.query(anyApi.products.list);
        const linked = (title: string) => rows.find((r: { title: string }) => r.title === title).linkedKitId;
        expect([linked('Kit Citron'), linked('Kit Cigale'), linked('PDF Citron')]).toEqual([kitId, '', '']);
        expect((await t.mutation(anyApi.products.importDrafts as never, batch as never) as { skipped: string[] }).skipped).toHaveLength(3);
    });
});
