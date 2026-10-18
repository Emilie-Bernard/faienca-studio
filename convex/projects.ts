import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { missionFile, projectStatus } from './schema';
import { requireAdmin, requireTrainee } from './access';
import { MAX_OPEN_PROJECT_QUESTIONS, projectError, projectFilesError, questionError } from '../lib/projects';

type FileDoc = Doc<'traineeProjects'>['files'][number];
const withUrls = async (ctx: QueryCtx, files: FileDoc[]) => await Promise.all(files.map(async f => ({ ...f, fileUrl: f.storageId ? await ctx.storage.getUrl(f.storageId) : null })));
const questionsOf = async (ctx: QueryCtx, projectId: Id<'traineeProjects'>) =>
    await ctx.db.query('projectQuestions').withIndex('by_project', q => q.eq('projectId', projectId)).collect();
const questionView = (q: Doc<'projectQuestions'>) => ({ _id: q._id, body: q.body, createdAt: q.createdAt, answer: q.answer ?? null, answeredAt: q.answeredAt ?? null });

/** Projet de la stagiaire connectée (l'administratrice peut aussi agir, comme dans l'espace Stage). */
async function ownProject(ctx: MutationCtx, id: Id<'traineeProjects'>) {
    const me = await requireTrainee(ctx);
    const project = await ctx.db.get(id);
    if (!project || (project.authorId !== me.id && me.role !== 'admin')) throw new ConvexError('Projet introuvable.');
    return { me, project };
}

// ——— Espace stagiaire ———

export const mine = query({
    args: {}, handler: async (ctx) => {
        const me = await requireTrainee(ctx);
        const rows = (await ctx.db.query('traineeProjects').withIndex('by_author', q => q.eq('authorId', me.id)).collect()).sort((a, b) => b.updatedAt - a.updatedAt);
        return await Promise.all(rows.map(async p => ({
            _id: p._id, title: p.title, description: p.description, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt,
            files: await withUrls(ctx, p.files), questions: (await questionsOf(ctx, p._id)).map(questionView),
        })));
    }
});

export const create = mutation({
    args: { title: v.string(), description: v.string() }, handler: async (ctx, data) => {
        const me = await requireTrainee(ctx);
        const error = projectError(data); if (error) throw new ConvexError(error);
        const now = Date.now();
        return await ctx.db.insert('traineeProjects', { authorId: me.id, title: data.title.trim(), description: data.description.trim(), status: 'idea', files: [], createdAt: now, updatedAt: now });
    }
});

export const update = mutation({
    args: { id: v.id('traineeProjects'), title: v.string(), description: v.string() }, handler: async (ctx, { id, ...data }) => {
        const { project } = await ownProject(ctx, id);
        const error = projectError(data); if (error) throw new ConvexError(error);
        const title = data.title.trim(), description = data.description.trim();
        if (title === project.title && description === project.description) return;
        await ctx.db.patch(id, { title, description, updatedAt: Date.now() });
    }
});

export const setStatus = mutation({
    args: { id: v.id('traineeProjects'), status: projectStatus }, handler: async (ctx, { id, status }) => {
        const { project } = await ownProject(ctx, id);
        if (project.status !== status) await ctx.db.patch(id, { status, updatedAt: Date.now() });
    }
});

export const addFile = mutation({
    args: { id: v.id('traineeProjects'), file: missionFile }, handler: async (ctx, { id, file }) => {
        const { project } = await ownProject(ctx, id);
        const files = [...project.files, { ...file, label: file.label.trim() }];
        const error = projectFilesError(files); if (error) throw new ConvexError(error);
        await ctx.db.patch(id, { files, updatedAt: Date.now() });
    }
});

export const removeFile = mutation({
    args: { id: v.id('traineeProjects'), fileId: v.string() }, handler: async (ctx, { id, fileId }) => {
        const { project } = await ownProject(ctx, id);
        for (const f of project.files) if (f.id === fileId && f.storageId) await ctx.storage.delete(f.storageId);
        await ctx.db.patch(id, { files: project.files.filter(f => f.id !== fileId), updatedAt: Date.now() });
    }
});

export const ask = mutation({
    args: { id: v.id('traineeProjects'), body: v.string() }, handler: async (ctx, { id, body }) => {
        const { me } = await ownProject(ctx, id);
        const error = questionError(body); if (error) throw new ConvexError(error);
        if ((await questionsOf(ctx, id)).filter(q => !q.answer).length >= MAX_OPEN_PROJECT_QUESTIONS) throw new ConvexError('Plusieurs questions attendent déjà une réponse sur ce projet.');
        const now = Date.now();
        await ctx.db.insert('projectQuestions', { projectId: id, authorId: me.id, body: body.trim(), createdAt: now });
        await ctx.db.patch(id, { updatedAt: now });
    }
});

export const removeQuestion = mutation({
    args: { id: v.id('projectQuestions') }, handler: async (ctx, { id }) => {
        const question = await ctx.db.get(id); if (!question) return;
        const { me } = await ownProject(ctx, question.projectId);
        if (me.role !== 'admin' && question.answer) throw new ConvexError('Une question qui a reçu une réponse ne peut plus être supprimée.');
        await ctx.db.delete(id);
    }
});

export const remove = mutation({
    args: { id: v.id('traineeProjects') }, handler: async (ctx, { id }) => {
        const { project } = await ownProject(ctx, id);
        for (const q of await questionsOf(ctx, id)) await ctx.db.delete(q._id);
        for (const f of project.files) if (f.storageId) await ctx.storage.delete(f.storageId);
        await ctx.db.delete(id);
    }
});

// ——— Administration ———

export const adminList = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const rows = (await ctx.db.query('traineeProjects').collect()).sort((a, b) => b.updatedAt - a.updatedAt);
        return await Promise.all(rows.map(async p => {
            const author = await ctx.db.get(p.authorId);
            const questions = await questionsOf(ctx, p._id);
            return {
                _id: p._id, title: p.title, description: p.description, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt,
                seenByAdminAt: p.seenByAdminAt ?? null, authorName: author?.name || author?.email || 'Stagiaire',
                files: await withUrls(ctx, p.files), questions: questions.map(questionView), openQuestions: questions.filter(q => !q.answer).length,
            };
        }));
    }
});

/** Pastille du menu : projets jamais ouverts ou questions sans réponse. */
export const adminPending = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const unseen = (await ctx.db.query('traineeProjects').collect()).filter(p => p.seenByAdminAt === undefined).length;
        const open = (await ctx.db.query('projectQuestions').collect()).filter(q => !q.answer).length;
        return unseen + open;
    }
});

export const markSeen = mutation({
    args: { id: v.id('traineeProjects') }, handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        if (await ctx.db.get(id)) await ctx.db.patch(id, { seenByAdminAt: Date.now() });
    }
});

export const answer = mutation({
    args: { id: v.id('projectQuestions'), answer: v.string() }, handler: async (ctx, { id, answer }) => {
        await requireAdmin(ctx);
        const question = await ctx.db.get(id); if (!question) throw new ConvexError('Question introuvable.');
        const text = answer.trim();
        if (text.length > 4000) throw new ConvexError('La réponse ne peut pas dépasser 4 000 caractères.');
        await ctx.db.patch(id, text ? { answer: text, answeredAt: Date.now() } : { answer: undefined, answeredAt: undefined });
    }
});
