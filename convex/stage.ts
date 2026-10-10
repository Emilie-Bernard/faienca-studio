import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { missionFile, missionStatus } from './schema';
import { requireAdmin, requireTrainee, roleOf } from './access';
import { filesError, missionError, traineeStatuses } from '../lib/stage';

type FileDoc = Doc<'missions'>['resources'][number];
const withUrls = async (ctx: QueryCtx, files: FileDoc[]) => await Promise.all(files.map(async f => ({ ...f, fileUrl: f.storageId ? await ctx.storage.getUrl(f.storageId) : null })));
const progressOf = async (ctx: QueryCtx, userId: Id<'users'>, missionId: Id<'missions'>) =>
    await ctx.db.query('missionProgress').withIndex('by_user_mission', q => q.eq('userId', userId).eq('missionId', missionId)).unique();
const deleteFiles = async (ctx: MutationCtx, files: FileDoc[], keep = new Set<string>()) => {
    for (const f of files) if (f.storageId && !keep.has(f.storageId)) await ctx.storage.delete(f.storageId);
};

// ——— Espace stagiaire ———

export const mine = query({
    args: {}, handler: async (ctx) => {
        const me = await requireTrainee(ctx);
        const missions = (await ctx.db.query('missions').collect()).filter(m => m.published).sort((a, b) => a.order - b.order);
        return await Promise.all(missions.map(async m => {
            const p = await progressOf(ctx, me.id, m._id);
            return {
                _id: m._id, title: m.title, description: m.description, phase: m.phase, dueDate: m.dueDate, resources: await withUrls(ctx, m.resources),
                progress: { status: p?.status ?? 'todo', notes: p?.notes ?? '', deliverables: await withUrls(ctx, p?.deliverables ?? []), feedback: p?.feedback ?? '', updatedAt: p?.updatedAt ?? null },
            };
        }));
    }
});

async function ensureProgress(ctx: MutationCtx, userId: Id<'users'>, missionId: Id<'missions'>) {
    const mission = await ctx.db.get(missionId);
    if (!mission || !mission.published) throw new ConvexError('Mission introuvable.');
    const existing = await progressOf(ctx, userId, missionId);
    if (existing) return existing;
    const id = await ctx.db.insert('missionProgress', { userId, missionId, status: 'todo', notes: '', deliverables: [], feedback: '', updatedAt: Date.now() });
    return (await ctx.db.get(id))!;
}

export const setStatus = mutation({
    args: { missionId: v.id('missions'), status: missionStatus }, handler: async (ctx, { missionId, status }) => {
        const me = await requireTrainee(ctx);
        if (!(traineeStatuses as readonly string[]).includes(status)) throw new ConvexError('Seule l’atelier peut valider une mission.');
        const p = await ensureProgress(ctx, me.id, missionId);
        if (p.status === 'validated') throw new ConvexError('Cette mission est validée. Demandez à l’atelier de la rouvrir pour la modifier.');
        await ctx.db.patch(p._id, { status, updatedAt: Date.now() });
    }
});

export const saveNotes = mutation({
    args: { missionId: v.id('missions'), notes: v.string() }, handler: async (ctx, { missionId, notes }) => {
        const me = await requireTrainee(ctx);
        if (notes.length > 5000) throw new ConvexError('Vos notes ne peuvent pas dépasser 5 000 caractères.');
        const p = await ensureProgress(ctx, me.id, missionId);
        await ctx.db.patch(p._id, { notes, updatedAt: Date.now() });
    }
});

export const addDeliverable = mutation({
    args: { missionId: v.id('missions'), file: missionFile }, handler: async (ctx, { missionId, file }) => {
        const me = await requireTrainee(ctx);
        const p = await ensureProgress(ctx, me.id, missionId);
        if (p.status === 'validated') throw new ConvexError('Cette mission est validée. Demandez à l’atelier de la rouvrir pour ajouter un rendu.');
        const deliverables = [...p.deliverables, { ...file, label: file.label.trim() }];
        const error = filesError(deliverables, 'Rendu'); if (error) throw new ConvexError(error);
        await ctx.db.patch(p._id, { deliverables, updatedAt: Date.now() });
    }
});

export const removeDeliverable = mutation({
    args: { missionId: v.id('missions'), fileId: v.string() }, handler: async (ctx, { missionId, fileId }) => {
        const me = await requireTrainee(ctx);
        const p = await progressOf(ctx, me.id, missionId); if (!p) return;
        if (p.status === 'validated') throw new ConvexError('Cette mission est validée. Demandez à l’atelier de la rouvrir pour modifier ses rendus.');
        await deleteFiles(ctx, p.deliverables.filter(f => f.id === fileId));
        await ctx.db.patch(p._id, { deliverables: p.deliverables.filter(f => f.id !== fileId), updatedAt: Date.now() });
    }
});

export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireTrainee(ctx); return await ctx.storage.generateUploadUrl(); }
});

// ——— Administration ———

export const adminList = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const missions = (await ctx.db.query('missions').collect()).sort((a, b) => a.order - b.order);
        const trainees = (await ctx.db.query('users').take(500)).filter(u => roleOf(u) === 'stagiaire');
        return {
            trainees: trainees.map(u => ({ _id: u._id, name: u.name ?? '', email: u.email ?? '' })),
            missions: await Promise.all(missions.map(async m => {
                const rows = await ctx.db.query('missionProgress').withIndex('by_mission', q => q.eq('missionId', m._id)).collect();
                return {
                    ...m, resources: await withUrls(ctx, m.resources),
                    progress: await Promise.all(rows.filter(p => trainees.some(u => u._id === p.userId)).map(async p => ({
                        userId: p.userId, status: p.status, notes: p.notes, feedback: p.feedback, updatedAt: p.updatedAt, deliverables: await withUrls(ctx, p.deliverables),
                    }))),
                };
            })),
        };
    }
});

export const saveMission = mutation({
    args: {
        id: v.optional(v.id('missions')), revision: v.optional(v.number()),
        data: v.object({ title: v.string(), description: v.string(), phase: v.string(), dueDate: v.string(), published: v.boolean(), resources: v.array(missionFile) }),
    }, handler: async (ctx, { id, revision, data }) => {
        await requireAdmin(ctx);
        const error = missionError(data); if (error) throw new ConvexError(error);
        const clean = { ...data, title: data.title.trim(), phase: data.phase.trim(), resources: data.resources.map(f => ({ ...f, label: f.label.trim() })) };
        if (!id) {
            const last = (await ctx.db.query('missions').collect()).reduce((n, m) => Math.max(n, m.order), 0);
            return await ctx.db.insert('missions', { ...clean, order: last + 1, revision: 1, updatedAt: Date.now() });
        }
        const before = await ctx.db.get(id); if (!before) throw new ConvexError('Mission introuvable.');
        if (before.revision !== revision) throw new ConvexError('Cette mission a été modifiée dans une autre session. Rechargez-la avant d’enregistrer.');
        await deleteFiles(ctx, before.resources, new Set(clean.resources.map(f => f.storageId).filter((s): s is Id<'_storage'> => !!s)));
        await ctx.db.patch(id, { ...clean, revision: before.revision + 1, updatedAt: Date.now() });
        return id;
    }
});

/** Échange la place d'une mission avec sa voisine : les positions sont renumérotées pour rester distinctes. */
export const moveMission = mutation({
    args: { id: v.id('missions'), direction: v.union(v.literal('up'), v.literal('down')) }, handler: async (ctx, { id, direction }) => {
        await requireAdmin(ctx);
        const all = (await ctx.db.query('missions').collect()).sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
        const i = all.findIndex(m => m._id === id); const j = direction === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= all.length) return;
        [all[i], all[j]] = [all[j]!, all[i]!];
        for (const [order, m] of all.entries()) if (m.order !== order + 1) await ctx.db.patch(m._id, { order: order + 1 });
    }
});

export const removeMission = mutation({
    args: { id: v.id('missions'), revision: v.number() }, handler: async (ctx, { id, revision }) => {
        await requireAdmin(ctx);
        const mission = await ctx.db.get(id); if (!mission) throw new ConvexError('Mission introuvable.');
        if (mission.revision !== revision) throw new ConvexError('Cette mission a changé. Rechargez-la.');
        for (const p of await ctx.db.query('missionProgress').withIndex('by_mission', q => q.eq('missionId', id)).collect()) { await deleteFiles(ctx, p.deliverables); await ctx.db.delete(p._id); }
        await deleteFiles(ctx, mission.resources);
        await ctx.db.delete(id);
    }
});

export const adminUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); }
});

/** Relecture : valider la mission, ou la rouvrir avec un commentaire. */
export const review = mutation({
    args: { missionId: v.id('missions'), userId: v.id('users'), status: v.union(v.literal('validated'), v.literal('doing')), feedback: v.string() },
    handler: async (ctx, { missionId, userId, status, feedback }) => {
        await requireAdmin(ctx);
        if (feedback.length > 4000) throw new ConvexError('Le commentaire ne peut pas dépasser 4 000 caractères.');
        const user = await ctx.db.get(userId); if (!user || roleOf(user) !== 'stagiaire') throw new ConvexError('Stagiaire introuvable.');
        if (!await ctx.db.get(missionId)) throw new ConvexError('Mission introuvable.');
        const p = await progressOf(ctx, userId, missionId);
        const patch = { status, feedback: feedback.trim(), updatedAt: Date.now() };
        if (p) await ctx.db.patch(p._id, patch);
        else await ctx.db.insert('missionProgress', { userId, missionId, notes: '', deliverables: [], ...patch });
    }
});
