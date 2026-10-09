import { query, mutation, internalMutation, type QueryCtx } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { kitFields, kitTranslations, lessonTranslations } from './schema';
import { requireAdmin, requireUser } from './access';
import { kitError, kitLanguages, localizeLesson, normalizeCode } from '../lib/kits';

const MAX_OPEN_QUESTIONS = 10;

async function withVideoFiles(ctx: QueryCtx, lessons: Doc<'kits'>['lessons']) {
    return await Promise.all(lessons.map(async l => ({ ...l, videoFileUrl: l.videoStorageId ? await ctx.storage.getUrl(l.videoStorageId) : null })));
}
async function progressOf(ctx: QueryCtx, userId: Id<'users'>, kitId: Id<'kits'>) {
    return await ctx.db.query('kitProgress').withIndex('by_user_kit', q => q.eq('userId', userId).eq('kitId', kitId)).unique();
}
/** Une cliente n'accède au contenu d'un kit publié qu'après l'avoir activé ; l'administratrice accède à tout. */
async function requireKitAccess(ctx: QueryCtx, kitId: Id<'kits'>) {
    const me = await requireUser(ctx);
    const kit = await ctx.db.get(kitId);
    if (!kit) throw new ConvexError('Kit introuvable.');
    const progress = await progressOf(ctx, me.id, kitId);
    if (me.role !== 'admin' && (!kit.published || !progress)) throw new ConvexError('Activez ce kit pour accéder à son contenu.');
    return { me, kit, progress };
}

const stitchesOf = (lessons: { stitch: string }[]) => [...new Set(lessons.map(l => l.stitch).filter(Boolean))];

// ——— Espace cliente ———

export const catalog = query({
    args: {}, handler: async (ctx) => {
        const me = await requireUser(ctx);
        const owned = new Set((await ctx.db.query('kitProgress').withIndex('by_user', q => q.eq('userId', me.id)).collect()).map(p => p.kitId));
        return (await ctx.db.query('kits').collect()).filter(k => k.published).map(k => ({
            _id: k._id, title: k.title, description: k.description, coverUrl: k.coverUrl, translations: k.translations,
            lessonCount: k.lessons.length, stitches: stitchesOf(k.lessons),
            stitchTranslations: Object.fromEntries(kitLanguages.map(lang => [lang, stitchesOf(k.lessons.map(l => localizeLesson(l, lang)))])),
            needsCode: !!k.accessCode, owned: owned.has(k._id),
        }));
    }
});

export const mine = query({
    args: {}, handler: async (ctx) => {
        const me = await requireUser(ctx);
        const rows = await ctx.db.query('kitProgress').withIndex('by_user', q => q.eq('userId', me.id)).collect();
        const result = [];
        for (const p of rows) {
            const kit = await ctx.db.get(p.kitId);
            if (!kit || (!kit.published && me.role !== 'admin')) continue;
            result.push({
                kit: { _id: kit._id, title: kit.title, description: kit.description, coverUrl: kit.coverUrl, translations: kit.translations, lessons: await withVideoFiles(ctx, kit.lessons) },
                progress: { completed: p.completed, notes: p.notes, startedAt: p.startedAt, updatedAt: p.updatedAt, finishedAt: p.finishedAt ?? null },
            });
        }
        return result.sort((a, b) => b.progress.updatedAt - a.progress.updatedAt);
    }
});

export const activate = mutation({
    args: { kitId: v.id('kits'), code: v.string() }, handler: async (ctx, { kitId, code }) => {
        const me = await requireUser(ctx);
        const kit = await ctx.db.get(kitId);
        if (!kit || !kit.published) throw new ConvexError('Kit introuvable.');
        const existing = await progressOf(ctx, me.id, kitId); if (existing) return existing._id;
        if (kit.accessCode && normalizeCode(code) !== normalizeCode(kit.accessCode)) throw new ConvexError('Ce code ne correspond pas à ce kit. Vérifiez la carte glissée dans votre boîte.');
        const now = Date.now();
        return await ctx.db.insert('kitProgress', { userId: me.id, kitId, completed: [], notes: '', startedAt: now, updatedAt: now });
    }
});

export const setLesson = mutation({
    args: { kitId: v.id('kits'), lessonId: v.string(), done: v.boolean() }, handler: async (ctx, { kitId, lessonId, done }) => {
        const { kit, progress } = await requireKitAccess(ctx, kitId);
        if (!progress) throw new ConvexError('Activez ce kit pour suivre votre progression.');
        if (!kit.lessons.some(l => l.id === lessonId)) throw new ConvexError('Leçon introuvable.');
        const completed = done ? [...new Set([...progress.completed, lessonId])] : progress.completed.filter(id => id !== lessonId);
        const finished = kit.lessons.length > 0 && kit.lessons.every(l => completed.includes(l.id));
        await ctx.db.patch(progress._id, { completed, updatedAt: Date.now(), finishedAt: finished ? progress.finishedAt ?? Date.now() : undefined });
    }
});

export const saveNotes = mutation({
    args: { kitId: v.id('kits'), notes: v.string() }, handler: async (ctx, { kitId, notes }) => {
        const { progress } = await requireKitAccess(ctx, kitId);
        if (!progress) throw new ConvexError('Activez ce kit pour garder des notes.');
        if (notes.length > 5000) throw new ConvexError('Vos notes ne peuvent pas dépasser 5 000 caractères.');
        await ctx.db.patch(progress._id, { notes, updatedAt: Date.now() });
    }
});

// ——— Questions et réponses ———

export const questions = query({
    args: { kitId: v.id('kits') }, handler: async (ctx, { kitId }) => {
        const { me } = await requireKitAccess(ctx, kitId);
        const rows = await ctx.db.query('kitQuestions').withIndex('by_kit', q => q.eq('kitId', kitId)).order('desc').take(300);
        return rows.filter(q => q.answer || q.userId === me.id || me.role === 'admin').map(q => ({
            _id: q._id, lessonId: q.lessonId, authorName: q.authorName, body: q.body, createdAt: q.createdAt,
            answer: q.answer ?? null, answeredAt: q.answeredAt ?? null, mine: q.userId === me.id,
        }));
    }
});

export const ask = mutation({
    args: { kitId: v.id('kits'), lessonId: v.string(), body: v.string() }, handler: async (ctx, { kitId, lessonId, body }) => {
        const { me, kit } = await requireKitAccess(ctx, kitId);
        const text = body.trim();
        if (text.length < 3 || text.length > 2000) throw new ConvexError('Votre question doit contenir entre 3 et 2 000 caractères.');
        if (lessonId && !kit.lessons.some(l => l.id === lessonId)) throw new ConvexError('Leçon introuvable.');
        const open = (await ctx.db.query('kitQuestions').withIndex('by_user', q => q.eq('userId', me.id)).collect()).filter(q => !q.answer);
        if (open.length >= MAX_OPEN_QUESTIONS) throw new ConvexError('Vous avez déjà plusieurs questions en attente. Une réponse arrive très vite !');
        const authorName = me.user.name?.trim().split(/\s+/)[0] || 'Une brodeuse';
        return await ctx.db.insert('kitQuestions', { kitId, lessonId, userId: me.id, authorName, body: text, createdAt: Date.now() });
    }
});

export const removeQuestion = mutation({
    args: { id: v.id('kitQuestions') }, handler: async (ctx, { id }) => {
        const me = await requireUser(ctx);
        const question = await ctx.db.get(id); if (!question) return;
        if (me.role !== 'admin' && (question.userId !== me.id || question.answer)) throw new ConvexError('Vous ne pouvez supprimer que vos questions encore sans réponse.');
        await ctx.db.delete(id);
    }
});

// ——— Administration ———

export const adminList = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const kits = await ctx.db.query('kits').collect();
        return await Promise.all(kits.map(async k => {
            const progress = await ctx.db.query('kitProgress').withIndex('by_kit', q => q.eq('kitId', k._id)).collect();
            const questions = await ctx.db.query('kitQuestions').withIndex('by_kit', q => q.eq('kitId', k._id)).collect();
            return {
                ...k, lessons: await withVideoFiles(ctx, k.lessons),
                stats: { clientes: progress.length, finished: progress.filter(p => p.finishedAt).length, openQuestions: questions.filter(q => !q.answer).length },
            };
        }));
    }
});

export const saveKit = mutation({
    args: { id: v.optional(v.id('kits')), revision: v.optional(v.number()), data: v.object(kitFields) }, handler: async (ctx, { id, revision, data }) => {
        await requireAdmin(ctx);
        const error = kitError(data); if (error) throw new ConvexError(error);
        const clean = { ...data, title: data.title.trim(), accessCode: data.accessCode.trim() };
        if (!id) return await ctx.db.insert('kits', { ...clean, revision: 1, updatedAt: Date.now() });
        const before = await ctx.db.get(id); if (!before) throw new ConvexError('Kit introuvable.');
        if (before.revision !== revision) throw new ConvexError('Ce kit a été modifié dans une autre session. Rechargez-le avant d’enregistrer.');
        const kept = new Set(clean.lessons.map(l => l.videoStorageId).filter(Boolean));
        for (const l of before.lessons) if (l.videoStorageId && !kept.has(l.videoStorageId)) await ctx.storage.delete(l.videoStorageId);
        await ctx.db.patch(id, { ...clean, revision: before.revision + 1, updatedAt: Date.now() });
        return id;
    }
});

export const removeKit = mutation({
    args: { id: v.id('kits'), revision: v.number() }, handler: async (ctx, { id, revision }) => {
        await requireAdmin(ctx);
        const kit = await ctx.db.get(id); if (!kit) throw new ConvexError('Kit introuvable.');
        if (kit.revision !== revision) throw new ConvexError('Ce kit a changé. Rechargez-le.');
        for (const p of await ctx.db.query('kitProgress').withIndex('by_kit', q => q.eq('kitId', id)).collect()) await ctx.db.delete(p._id);
        for (const q of await ctx.db.query('kitQuestions').withIndex('by_kit', q => q.eq('kitId', id)).collect()) await ctx.db.delete(q._id);
        for (const l of kit.lessons) if (l.videoStorageId) await ctx.storage.delete(l.videoStorageId);
        await ctx.db.delete(id);
    }
});

export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); }
});

export const adminQuestions = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const kits = new Map((await ctx.db.query('kits').collect()).map(k => [k._id, k]));
        const rows = await ctx.db.query('kitQuestions').order('desc').take(500);
        return await Promise.all(rows.map(async q => {
            const kit = kits.get(q.kitId); const author = await ctx.db.get(q.userId);
            return {
                _id: q._id, kitId: q.kitId, kitTitle: kit?.title ?? 'Kit supprimé', lessonTitle: kit?.lessons.find(l => l.id === q.lessonId)?.title ?? '',
                authorName: q.authorName, authorEmail: author?.email ?? '', body: q.body, createdAt: q.createdAt, answer: q.answer ?? null, answeredAt: q.answeredAt ?? null,
            };
        }));
    }
});

export const answer = mutation({
    args: { id: v.id('kitQuestions'), answer: v.string() }, handler: async (ctx, { id, answer }) => {
        await requireAdmin(ctx);
        const question = await ctx.db.get(id); if (!question) throw new ConvexError('Question introuvable.');
        const text = answer.trim();
        if (text.length > 4000) throw new ConvexError('La réponse ne peut pas dépasser 4 000 caractères.');
        await ctx.db.patch(id, text ? { answer: text, answeredAt: Date.now() } : { answer: undefined, answeredAt: undefined });
    }
});

/** Import en ligne de commande (brouillons) : ignore un kit dont le titre existe déjà. */
export const importDrafts = internalMutation({
    args: { kits: v.array(v.object(kitFields)) }, handler: async (ctx, { kits }) => {
        const existing = new Set((await ctx.db.query('kits').collect()).map(k => k.title.trim().toLowerCase()));
        const created: string[] = [], skipped: string[] = [];
        for (const data of kits) {
            const error = kitError(data); if (error) throw new ConvexError(`${data.title} : ${error}`);
            if (existing.has(data.title.trim().toLowerCase())) { skipped.push(data.title); continue; }
            await ctx.db.insert('kits', { ...data, published: false, revision: 1, updatedAt: Date.now() });
            existing.add(data.title.trim().toLowerCase()); created.push(data.title);
        }
        return { created, skipped };
    }
});

/** Import en ligne de commande des traductions : ne modifie que les textes traduits des kits et des leçons existants. */
export const importTranslations = internalMutation({
    args: { kits: v.array(v.object({ id: v.id('kits'), translations: kitTranslations, lessons: v.array(v.object({ id: v.string(), translations: lessonTranslations })) })) },
    handler: async (ctx, { kits }) => {
        const updated: string[] = [], missing: string[] = [];
        for (const item of kits) {
            const kit = await ctx.db.get(item.id); if (!kit) { missing.push(item.id); continue; }
            const byId = new Map(item.lessons.map(l => [l.id, l.translations]));
            const data = { ...kit, translations: item.translations, lessons: kit.lessons.map(l => byId.has(l.id) ? { ...l, translations: byId.get(l.id) } : l) };
            const error = kitError(data); if (error) throw new ConvexError(`${kit.title} : ${error}`);
            await ctx.db.patch(item.id, { translations: data.translations, lessons: data.lessons, revision: kit.revision + 1, updatedAt: Date.now() });
            updated.push(kit.title);
        }
        return { updated, missing };
    }
});
