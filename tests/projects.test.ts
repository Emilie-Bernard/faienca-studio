import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { hasNews, projectError, questionError } from '../lib/projects';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.stubEnv('OWNER_GITHUB_ID', '123'));

async function setup() {
    const t = convexTest(schema, modules);
    const as = async (doc: Record<string, unknown>) => { const id = await t.run(ctx => ctx.db.insert('users', doc)); return { id, api: t.withIdentity({ subject: id + '|session' }) }; };
    const atelier = await as({ githubId: '123' });
    const lola = await as({ email: 'lola@example.com', name: 'Lola', role: 'stagiaire' });
    const zoe = await as({ email: 'zoe@example.com', name: 'Zoé', role: 'stagiaire' });
    const marie = await as({ email: 'marie@example.com', name: 'Marie', role: 'cliente' });
    return { t, atelier, lola, zoe, marie };
}

describe('Validation des projets', () => {
    it('exige un titre et une question lisible', () => {
        expect(projectError({ title: 'Kit débutante', description: '' })).toBeNull();
        expect(projectError({ title: '  ', description: '' })).toMatch('titre');
        expect(questionError('ok')).toMatch('3');
        expect(questionError('Quel tissu ?')).toBeNull();
    });
    it('signale les nouveautés à l’atelier', () => {
        expect(hasNews({ updatedAt: 1, seenByAdminAt: null, openQuestions: 0 })).toBe(true);
        expect(hasNews({ updatedAt: 1, seenByAdminAt: 2, openQuestions: 0 })).toBe(false);
        expect(hasNews({ updatedAt: 3, seenByAdminAt: 2, openQuestions: 0 })).toBe(true);
        expect(hasNews({ updatedAt: 1, seenByAdminAt: 2, openQuestions: 1 })).toBe(true);
    });
});

describe('Projets de la stagiaire', () => {
    it('la stagiaire crée un projet que l’atelier voit, les clientes non', async () => {
        const { atelier, lola, zoe, marie } = await setup();
        await expect(marie.api.mutation(anyApi.projects.create, { title: 'X', description: '' })).rejects.toThrow('stagiaire');
        const id = await lola.api.mutation(anyApi.projects.create, { title: ' Kit débutante ', description: 'Pour les enfants' });
        expect(await lola.api.query(anyApi.projects.mine)).toMatchObject([{ title: 'Kit débutante', status: 'idea' }]);
        expect(await zoe.api.query(anyApi.projects.mine)).toEqual([]);
        await expect(zoe.api.mutation(anyApi.projects.update, { id, title: 'Volé', description: '' })).rejects.toThrow('introuvable');
        await expect(lola.api.query(anyApi.projects.adminList)).rejects.toThrow('propriétaire');
        expect(await atelier.api.query(anyApi.projects.adminList)).toMatchObject([{ title: 'Kit débutante', authorName: 'Lola', seenByAdminAt: null }]);
        expect(await atelier.api.query(anyApi.projects.adminPending)).toBe(1);
        await atelier.api.mutation(anyApi.projects.markSeen, { id });
        expect(await atelier.api.query(anyApi.projects.adminPending)).toBe(0);
    });
    it('documents, statut et questions avec réponses', async () => {
        const { atelier, lola } = await setup();
        const id = await lola.api.mutation(anyApi.projects.create, { title: 'Kit débutante', description: '' });
        await lola.api.mutation(anyApi.projects.setStatus, { id, status: 'doing' });
        await lola.api.mutation(anyApi.projects.addFile, { id, file: { id: 'f1', label: 'Moodboard', url: 'https://example.com/board' } });
        await expect(lola.api.mutation(anyApi.projects.addFile, { id, file: { id: 'f2', label: 'Lien', url: 'http://x.fr' } })).rejects.toThrow('https');
        await lola.api.mutation(anyApi.projects.ask, { id, body: 'Quel tissu choisir ?' });
        expect(await atelier.api.query(anyApi.projects.adminPending)).toBe(2);
        const [project] = await atelier.api.query(anyApi.projects.adminList);
        expect(project).toMatchObject({ status: 'doing', openQuestions: 1, files: [{ label: 'Moodboard' }] });
        await atelier.api.mutation(anyApi.projects.answer, { id: project.questions[0]._id, answer: 'Du lin 28 fils.' });
        const [mine] = await lola.api.query(anyApi.projects.mine);
        expect(mine.questions[0]).toMatchObject({ answer: 'Du lin 28 fils.' });
        await expect(lola.api.mutation(anyApi.projects.removeQuestion, { id: mine.questions[0]._id })).rejects.toThrow('réponse');
        await lola.api.mutation(anyApi.projects.removeFile, { id, fileId: 'f1' });
        await lola.api.mutation(anyApi.projects.remove, { id });
        expect(await atelier.api.query(anyApi.projects.adminList)).toEqual([]);
    });
});
