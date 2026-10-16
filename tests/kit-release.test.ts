import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyKit, kitStatus, statusFields, type KitInput } from '../lib/kits';
import { releaseEmail } from '../lib/release-email';
const modules = import.meta.glob('../convex/**/*.ts');

const lesson = (id: string) => ({ id, title: 'Leçon ' + id, stitch: 'Point de tige', videoUrl: 'https://youtu.be/abc', notes: '' });
const kit = (patch: Partial<KitInput> = {}): KitInput => ({ ...emptyKit(), title: 'Kit Olivier', accessCode: 'OLIVE-24', published: false, upcoming: true, lessons: [lesson('a'), lesson('b')], ...patch });

beforeEach(() => {
    vi.stubEnv('OWNER_GITHUB_ID', '123'); vi.stubEnv('AUTH_RESEND_KEY', 're_test'); vi.stubEnv('SITE_URL', 'https://carnet.faienca.fr/');
    vi.stubEnv('AUTH_EMAIL_FROM', 'Faïença <contact@faienca.fr>');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (doc: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', doc)); return { id, api: t.withIdentity({ subject: id + '|session' }) }; };
    const atelier = await as({ githubId: '123' });
    const marie = await as({ email: 'marie@example.com', name: 'Marie Dupont', role: 'cliente', locale: 'en' });
    const lea = await as({ email: 'lea@example.com', name: 'Léa', role: 'cliente' });
    return { t, atelier, marie, lea };
}

describe('Statut des kits', () => {
    it('distingue brouillon, à venir et publié', () => {
        expect(kitStatus({ published: false })).toBe('draft');
        expect(kitStatus({ published: false, upcoming: true })).toBe('upcoming');
        expect(kitStatus({ published: true, upcoming: true })).toBe('published');
        expect(statusFields('upcoming')).toEqual({ published: false, upcoming: true });
    });
});

describe('Kits à venir', () => {
    it('s’affiche au catalogue, s’active avec le code, sans livrer les leçons', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit() });
        await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ title: 'Brouillon', upcoming: false }) });
        const catalog = await marie.api.query(anyApi.kits.catalog);
        expect(catalog.map((k: { title: string, upcoming: boolean }) => [k.title, k.upcoming])).toEqual([['Kit Olivier', true]]);
        await expect(marie.api.mutation(anyApi.kits.activate, { kitId, code: 'FAUX' })).rejects.toThrow('code');
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: 'olive 24' });
        const [mine] = await marie.api.query(anyApi.kits.mine);
        expect(mine.kit).toMatchObject({ upcoming: true, lessons: [] });
        await expect(marie.api.query(anyApi.kits.questions, { kitId })).rejects.toThrow('Activez');
        expect((await atelier.api.query(anyApi.kits.adminList))[0].stats.waiting).toBe(1);
    });

    it('prévient par e-mail, une seule fois, les clientes en attente à la publication', async () => {
        vi.useFakeTimers();
        const { t, atelier, marie, lea } = await setup();
        const fetch = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit() });
        await marie.api.mutation(anyApi.kits.activate, { kitId, code: 'OLIVE-24' });
        await atelier.api.mutation(anyApi.kits.grant, { userId: lea.id, kitId });
        const [saved] = await atelier.api.query(anyApi.kits.adminList);
        await atelier.api.mutation(anyApi.kits.saveKit, { id: kitId, revision: saved.revision, data: kit({ published: true }) });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.resend.com/emails/batch');
        const emails = JSON.parse(String(init.body)) as { to: string[], subject: string, html: string }[];
        expect(emails.map(e => e.to[0]).sort()).toEqual(['lea@example.com', 'marie@example.com']);
        expect(emails.find(e => e.to[0] === 'marie@example.com')!.subject).toBe('Your “Kit Olivier” kit is now available');
        expect(emails.find(e => e.to[0] === 'lea@example.com')!.html).toContain(`https://carnet.faienca.fr/?kit=${kitId}`);
        expect((await marie.api.query(anyApi.kits.mine))[0].kit.lessons).toHaveLength(2);
        // Republier ne renvoie rien : les clientes sont déjà prévenues.
        await atelier.api.mutation(anyApi.kits.notifyRelease, { kitId });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        expect(fetch).toHaveBeenCalledTimes(1);
        const accounts = await atelier.api.query(anyApi.users.list);
        expect(accounts.find((a: { _id: string }) => a._id === lea.id).kits[0]).toMatchObject({ source: 'admin', awaitingRelease: false, notifiedAt: expect.any(Number) });
    });
});

describe('Kits offerts par l’atelier', () => {
    it('ajoute un kit publié sans code puis le retire', async () => {
        const { atelier, marie } = await setup();
        const kitId = await atelier.api.mutation(anyApi.kits.saveKit, { data: kit({ published: true, upcoming: false }) });
        await expect(marie.api.mutation(anyApi.kits.grant, { userId: marie.id, kitId })).rejects.toThrow('propriétaire');
        await atelier.api.mutation(anyApi.kits.grant, { userId: marie.id, kitId });
        await atelier.api.mutation(anyApi.kits.grant, { userId: marie.id, kitId });
        expect(await marie.api.query(anyApi.kits.mine)).toHaveLength(1);
        const account = (await atelier.api.query(anyApi.users.list)).find((a: { _id: string }) => a._id === marie.id);
        expect(account.kits).toEqual([expect.objectContaining({ kitId, title: 'Kit Olivier', status: 'published', source: 'admin', done: 0, total: 2, awaitingRelease: false })]);
        await atelier.api.mutation(anyApi.kits.revoke, { userId: marie.id, kitId });
        expect(await marie.api.query(anyApi.kits.mine)).toHaveLength(0);
    });
});

describe('Suivi des connexions', () => {
    it('date la dernière connexion, compte les visites et retient la langue', async () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
        const { atelier, lea } = await setup();
        const row = async () => (await atelier.api.query(anyApi.users.list)).find((a: { _id: string }) => a._id === lea.id);
        expect(await row()).toMatchObject({ lastSeenAt: null, visits: 0 });
        await lea.api.mutation(anyApi.users.ping, { locale: 'es' });
        expect(await row()).toMatchObject({ lastSeenAt: Date.parse('2026-10-01T10:00:00Z'), visits: 1 });
        vi.setSystemTime(new Date('2026-10-01T10:10:00Z')); await lea.api.mutation(anyApi.users.ping, { locale: 'es' });
        expect(await row()).toMatchObject({ lastSeenAt: Date.parse('2026-10-01T10:10:00Z'), visits: 1 });
        vi.setSystemTime(new Date('2026-10-02T09:00:00Z')); await lea.api.mutation(anyApi.users.ping, { locale: 'xx' });
        expect(await row()).toMatchObject({ visits: 2 });
    });
});

describe('E-mail de sortie', () => {
    it('échappe le texte et rédige dans la langue de la cliente', () => {
        const fr = releaseEmail({ firstName: 'Zoé <b>', kitTitle: 'Le vase & les citrons', coverUrl: 'https://cdn.faienca.fr/vase.jpg', kitUrl: 'https://carnet.faienca.fr/?kit=1', logoUrl: 'https://carnet.faienca.fr/brand/logo-email.png' });
        expect(fr.subject).toBe('Votre kit « Le vase & les citrons » est disponible');
        expect(fr.html).toContain('Bonjour Zoé &lt;b&gt;,');
        expect(fr.html).toContain('Le vase &amp; les citrons');
        expect(fr.html).toContain('https://cdn.faienca.fr/vase.jpg');
        expect(fr.text).toContain('https://carnet.faienca.fr/?kit=1');
        expect(releaseEmail({ locale: 'es', firstName: '', kitTitle: 'Olivo', coverUrl: '', kitUrl: 'https://x.fr', logoUrl: 'https://x.fr/l.png' }).html).toContain('Hola:');
        expect(() => releaseEmail({ firstName: '', kitTitle: 'x', coverUrl: '', kitUrl: 'javascript:alert(1)', logoUrl: '' })).toThrow();
    });
});
