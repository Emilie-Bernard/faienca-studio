import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { emptyMission, groupByPhase, missionError, percentDone, type MissionInput } from '../lib/stage';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

const mission = (patch: Partial<MissionInput> = {}): MissionInput => ({ ...emptyMission(), title: 'Brodez un carré de points', phase: 'Apprendre', published: true, ...patch });

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (doc: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', doc)); return { id, api: t.withIdentity({ subject: id + '|session' }) }; };
    const atelier = await as({ githubId: '123' });
    const lola = await as({ email: 'lola@example.com', name: 'Lola', role: 'stagiaire' });
    const marie = await as({ email: 'marie@example.com', name: 'Marie', role: 'cliente' });
    return { t, atelier, lola, marie };
}

describe('Validation des missions', () => {
    it('exige un titre et des liens https', () => {
        expect(missionError(mission())).toBeNull();
        expect(missionError(mission({ title: ' ' }))).toMatch('titre');
        expect(missionError(mission({ dueDate: '2026-02-31' }))).toMatch('date');
        expect(missionError(mission({ resources: [{ id: 'a', label: 'Guide', url: 'http://x.fr' }] }))).toMatch('https');
        expect(missionError(mission({ resources: [{ id: 'a', label: 'Vide', url: '' }] }))).toMatch('fichier ou un lien');
    });
    it('regroupe par phase et calcule l’avancement', () => {
        expect(groupByPhase([{ phase: 'A' }, { phase: '' }, { phase: 'A' }]).map(g => [g.phase, g.missions.length])).toEqual([['A', 2], ['Sans phase', 1]]);
        expect(percentDone(['todo', 'doing', 'submitted', 'validated'])).toBe(50);
        expect(percentDone([])).toBe(0);
    });
});

describe('Espace stage', () => {
    it('réserve la gestion aux admins et le suivi à la stagiaire', async () => {
        const { atelier, lola, marie } = await setup();
        await expect(lola.api.mutation(anyApi.stage.saveMission, { data: mission() })).rejects.toThrow('propriétaire');
        await expect(lola.api.query(anyApi.stage.adminList)).rejects.toThrow('propriétaire');
        await expect(marie.api.query(anyApi.stage.mine)).rejects.toThrow('stagiaire');
        await expect(marie.api.mutation(anyApi.stage.generateUploadUrl)).rejects.toThrow('stagiaire');
        await atelier.api.mutation(anyApi.stage.saveMission, { data: mission() });
        expect(await lola.api.query(anyApi.stage.mine)).toHaveLength(1);
    });
    it('masque les brouillons et garde l’ordre des missions', async () => {
        const { atelier, lola } = await setup();
        await atelier.api.mutation(anyApi.stage.saveMission, { data: mission({ title: 'Une' }) });
        await atelier.api.mutation(anyApi.stage.saveMission, { data: mission({ title: 'Brouillon', published: false }) });
        const deux = await atelier.api.mutation(anyApi.stage.saveMission, { data: mission({ title: 'Deux' }) });
        expect((await lola.api.query(anyApi.stage.mine)).map((m: { title: string }) => m.title)).toEqual(['Une', 'Deux']);
        await atelier.api.mutation(anyApi.stage.moveMission, { id: deux, direction: 'up' });
        await atelier.api.mutation(anyApi.stage.moveMission, { id: deux, direction: 'up' });
        expect((await lola.api.query(anyApi.stage.mine)).map((m: { title: string }) => m.title)).toEqual(['Deux', 'Une']);
    });
    it('suit le parcours : en cours, rendu, relecture, validation', async () => {
        const { atelier, lola } = await setup();
        const id = await atelier.api.mutation(anyApi.stage.saveMission, { data: mission() });
        await lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'doing' });
        await lola.api.mutation(anyApi.stage.saveNotes, { missionId: id, notes: 'Le point de tige tire un peu.' });
        await lola.api.mutation(anyApi.stage.addDeliverable, { missionId: id, file: { id: 'r1', label: 'Mon carré', url: 'https://example.com/carre.jpg' } });
        await expect(lola.api.mutation(anyApi.stage.addDeliverable, { missionId: id, file: { id: 'r2', label: 'x', url: 'javascript:alert(1)' } })).rejects.toThrow('https');
        await lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'submitted' });
        await expect(lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'validated' })).rejects.toThrow('atelier');

        const before = await atelier.api.query(anyApi.stage.adminList);
        expect(before.trainees).toHaveLength(1);
        expect(before.missions[0].progress[0]).toMatchObject({ status: 'submitted', notes: 'Le point de tige tire un peu.' });

        await atelier.api.mutation(anyApi.stage.review, { missionId: id, userId: lola.id, status: 'validated', feedback: 'Bravo, régulier.' });
        const mine = (await lola.api.query(anyApi.stage.mine))[0];
        expect(mine.progress).toMatchObject({ status: 'validated', feedback: 'Bravo, régulier.' });
        await expect(lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'doing' })).rejects.toThrow('validée');
        await expect(lola.api.mutation(anyApi.stage.removeDeliverable, { missionId: id, fileId: 'r1' })).rejects.toThrow('validée');

        await atelier.api.mutation(anyApi.stage.review, { missionId: id, userId: lola.id, status: 'doing', feedback: 'Refais le dernier rang.' });
        await lola.api.mutation(anyApi.stage.removeDeliverable, { missionId: id, fileId: 'r1' });
        expect((await lola.api.query(anyApi.stage.mine))[0].progress.deliverables).toEqual([]);
    });
    it('garde l’avancement de chaque stagiaire séparé', async () => {
        const { t, atelier, lola } = await setup();
        const lea = await t.run(ctx => ctx.db.insert('users', { email: 'lea@example.com', role: 'stagiaire' }));
        const leaApi = t.withIdentity({ subject: lea + '|session' });
        const id = await atelier.api.mutation(anyApi.stage.saveMission, { data: mission() });
        await lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'doing' });
        expect((await leaApi.query(anyApi.stage.mine))[0].progress.status).toBe('todo');
    });
    it('refuse une mission non publiée ou une modification concurrente', async () => {
        const { atelier, lola } = await setup();
        const id = await atelier.api.mutation(anyApi.stage.saveMission, { data: mission({ published: false }) });
        await expect(lola.api.mutation(anyApi.stage.setStatus, { missionId: id, status: 'doing' })).rejects.toThrow('introuvable');
        await atelier.api.mutation(anyApi.stage.saveMission, { id, revision: 1, data: mission({ title: 'Nouvelle' }) });
        await expect(atelier.api.mutation(anyApi.stage.saveMission, { id, revision: 1, data: mission() })).rejects.toThrow('autre session');
        await expect(atelier.api.mutation(anyApi.stage.removeMission, { id, revision: 1 })).rejects.toThrow('changé');
        await atelier.api.mutation(anyApi.stage.removeMission, { id, revision: 2 });
    });
    it('permet de promouvoir un compte en stagiaire', async () => {
        const { atelier, marie } = await setup();
        await atelier.api.mutation(anyApi.users.setRole, { userId: marie.id, role: 'stagiaire' });
        expect((await marie.api.query(anyApi.users.me)).role).toBe('stagiaire');
        expect(await marie.api.query(anyApi.stage.mine)).toEqual([]);
    });
});
