import { queryGeneric as query, mutationGeneric as mutation, internalMutationGeneric as internalMutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { entryFields, missionFile } from './schema';
import { contentStatuses, projectStatuses, certainties, stages, newsletterCampaignStatuses, scenarioStatuses, type EntryInput } from '../lib/model';
import seeds from './seed.json';
import { requireAdmin } from './access';

const owner = requireAdmin;
function validate(e: EntryInput) {
    if (!e.title.trim() || e.title.length > 200) throw new ConvexError('Le titre doit contenir entre 1 et 200 caractères.');
    const statuses = e.kind === 'publication' ? contentStatuses : e.kind === 'projet' ? projectStatuses : e.kind === 'newsletter' ? newsletterCampaignStatuses : e.kind === 'scenario' ? scenarioStatuses : certainties;
    if (!(statuses as readonly string[]).includes(e.status)) throw new ConvexError('Statut invalide.');
    if (e.date && (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0, 10) !== e.date)) throw new ConvexError('Date invalide.');
    if (e.url && !/^https?:\/\//i.test(e.url)) throw new ConvexError('Le lien doit commencer par https:// ou http://.');
    if (e.kind === 'publication' && !(stages as readonly string[]).includes(e.stage)) throw new ConvexError('Étape invalide.');
    if (e.kind === 'scenario') {
        if (e.emailSteps.length < 1 || e.emailSteps.length > 20) throw new ConvexError('Un scénario contient entre 1 et 20 e-mails.');
        if (e.emailSteps.some(s => !Number.isSafeInteger(s.delayDays) || s.delayDays < 0 || s.delayDays > 365)) throw new ConvexError('Chaque délai doit être un nombre de jours entre 0 et 365.');
        if (e.emailSteps.some(s => s.subject.length > 200)) throw new ConvexError('Chaque objet ne peut pas dépasser 200 caractères.');
        if (new Set(e.emailSteps.map(s => s.id)).size !== e.emailSteps.length) throw new ConvexError('Identifiants d’e-mails dupliqués.');
    }
    for (const key of ['reach', 'saves', 'shares', 'clicks', 'orders'] as const) if (e[key] !== null && (!Number.isSafeInteger(e[key]) || e[key]! < 0)) throw new ConvexError('Les résultats doivent être des nombres entiers positifs ou vides.');
    if (e.tasks.length > 100 || e.tasks.some(t => !t.title.trim()) || new Set(e.tasks.map(t => t.id)).size !== e.tasks.length) throw new ConvexError('Liste de tâches invalide.');
}
export const list = query({
    args: {}, handler: async (ctx) => {
        await owner(ctx);
        return (await ctx.db.query('entries').collect()).map(e => ({ ...e, emailSteps: e.emailSteps ?? [] }));
    }
});
export const save = mutation({
    args: { id: v.optional(v.id('entries')), revision: v.optional(v.number()), data: v.object(entryFields) }, handler: async (ctx, { id, revision, data }) => {
        await owner(ctx); validate(data);
        if (data.projectId) { const projectId = ctx.db.normalizeId('entries', data.projectId); const project = projectId ? await ctx.db.get(projectId) : null; if (!project || project.kind !== 'projet') throw new ConvexError('Projet associé introuvable.'); }
        if (id) { const before = await ctx.db.get(id); if (!before) throw new ConvexError('Élément introuvable.'); if (before.kind !== data.kind) throw new ConvexError('Type immuable.'); if (before.revision !== revision) throw new ConvexError('Modifié dans une autre session. Votre brouillon est conservé : rechargez la fiche avant de fusionner vos changements.'); await ctx.db.patch(id, { ...data, revision: before.revision + 1 }); return id; }
        return await ctx.db.insert('entries', { ...data, revision: 1 });
    }
});
export const remove = mutation({
    args: { id: v.id('entries'), revision: v.number() }, handler: async (ctx, { id, revision }) => {
        await owner(ctx); const before = await ctx.db.get(id); if (!before) throw new ConvexError('Élément introuvable.'); if (before.revision !== revision) throw new ConvexError('La fiche a changé. Rechargez-la.');
        for (const f of before.media ?? []) if (f.storageId) await ctx.storage.delete(f.storageId);
        if (before.kind === 'projet') for (const e of await ctx.db.query('entries').collect()) if (e.projectId === id) await ctx.db.patch(e._id, { projectId: '', revision: e.revision + 1 });
        await ctx.db.delete(id);
    }
});
export const initialize = mutation({
    args: {}, handler: async (ctx) => {
        await owner(ctx);
        for (const e of await ctx.db.query('entries').collect()) if (e.emailSteps === undefined) await ctx.db.patch(e._id, { emailSteps: [] });
        const version = 'faienca-2026-v1'; if (await ctx.db.query('seeds').withIndex('version', q => q.eq('version', version)).first()) return { inserted: 0 };
        const ids: Record<string, string> = {}; let inserted = 0;
        for (const s of seeds.filter(e => e.data.kind === 'projet')) { ids[s.key] = await ctx.db.insert('entries', { ...s.data, ...{ kind: 'projet' as const }, emailSteps: [], revision: 1, seedKey: s.key }); inserted++; }
        for (const s of seeds.filter(e => e.data.kind !== 'projet')) { const data = { ...s.data, kind: s.data.kind as EntryInput['kind'], projectId: ids[s.data.projectId] ?? '', emailSteps: [] }; validate(data); await ctx.db.insert('entries', { ...data, revision: 1, seedKey: s.key }); inserted++; }
        await ctx.db.insert('seeds', { version }); return { inserted };
    }
});

// Visuels à poster : rangés à part de la fiche, sans toucher à sa révision, pour qu'un envoi ne bloque pas l'enregistrement en cours.
const MAX_MEDIA = 20;
async function publication(ctx: { db: any }, id: string) {
    const e = await ctx.db.get(id); if (!e || e.kind !== 'publication') throw new ConvexError('Publication introuvable.');
    return e as { _id: string; media?: { id: string; label: string; url: string; storageId?: string }[] };
}
async function appendMedia(ctx: { db: any }, id: string, files: { id: string; label: string; url: string; storageId?: string }[]) {
    const e = await publication(ctx, id); const media = [...(e.media ?? []), ...files];
    if (media.length > MAX_MEDIA) throw new ConvexError(`${MAX_MEDIA} visuels au maximum par publication.`);
    if (files.some(f => !f.storageId || f.label.length > 120)) throw new ConvexError('Visuel invalide.');
    await ctx.db.patch(e._id as never, { media });
}
export const media = query({
    args: { id: v.id('entries') }, handler: async (ctx, { id }) => {
        await owner(ctx); const e = await ctx.db.get(id); if (!e) return [];
        return await Promise.all((e.media ?? []).map(async (f: { storageId?: string }) => ({ ...f, fileUrl: f.storageId ? await ctx.storage.getUrl(f.storageId) : null })));
    }
});
export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await owner(ctx); return await ctx.storage.generateUploadUrl(); }
});
export const addMedia = mutation({
    args: { id: v.id('entries'), files: v.array(missionFile) }, handler: async (ctx, { id, files }) => { await owner(ctx); await appendMedia(ctx, id, files); }
});
async function deleteMedia(ctx: { db: any; storage: any }, id: string, fileId: string) {
    const e = await publication(ctx, id); const file = (e.media ?? []).find(f => f.id === fileId); if (!file) return false;
    if (file.storageId) await ctx.storage.delete(file.storageId as never);
    await ctx.db.patch(e._id as never, { media: (e.media ?? []).filter(f => f.id !== fileId) });
    return true;
}
export const removeMedia = mutation({
    args: { id: v.id('entries'), fileId: v.string() }, handler: async (ctx, { id, fileId }) => { await owner(ctx); await deleteMedia(ctx, id, fileId); }
});
/** En ligne de commande : URL d'envoi, puis rattachement des visuels envoyés à une publication. */
export const cliUploadUrl = internalMutation({ args: {}, handler: async (ctx) => await ctx.storage.generateUploadUrl() });
export const cliAttachMedia = internalMutation({
    args: { id: v.id('entries'), files: v.array(missionFile) }, handler: async (ctx, { id, files }) => { await appendMedia(ctx, id, files); return { count: files.length }; }
});
export const cliRemoveMedia = internalMutation({
    args: { id: v.id('entries'), fileId: v.string() }, handler: async (ctx, { id, fileId }) => ({ removed: await deleteMedia(ctx, id, fileId) })
});
export const cliPatchPublication = internalMutation({
    args: { id: v.id('entries'), patch: v.object({ hook: v.optional(v.string()), text: v.optional(v.string()), cta: v.optional(v.string()), caveat: v.optional(v.string()), format: v.optional(v.string()), stories: v.optional(v.string()) }) },
    handler: async (ctx, { id, patch }) => { const e = await ctx.db.get(id); if (!e || e.kind !== 'publication') throw new ConvexError('Publication introuvable.'); await ctx.db.patch(id, { ...patch, revision: e.revision + 1 }); }
});
