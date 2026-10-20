import { query, mutation, internalMutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { workshopFields } from './schema';
import { requireTrainee } from './access';
import { mergeWorkshop, nameKey, normalizeWorkshop, workshopError, type WorkshopInput } from '../lib/veille';

// Ateliers de broderie d'art en France, dans la Veille textile : partagés entre l'atelier et les stagiaires.

const authorOf = (me: Awaited<ReturnType<typeof requireTrainee>>) => me.role === 'admin' ? 'L’atelier' : (me.user.name || me.user.email || 'Stagiaire');
const newId = () => crypto.randomUUID();
const fieldsOf = (w: Doc<'workshops'>): WorkshopInput => {
    const { _id, _creationTime, nameKey: _k, createdAt, updatedAt, authorName, ...rest } = w;
    void _id; void _creationTime; void _k; void createdAt; void updatedAt; void authorName;
    return { ...rest, works: rest.works ?? [] };
};

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        const rows = await ctx.db.query('workshops').collect();
        return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(w => ({
            _id: w._id, name: w.name, city: w.city, region: w.region, foundedDate: w.foundedDate, closedDate: w.closedDate,
            founders: w.founders, techniques: w.techniques, labels: w.labels, summary: w.summary, photoUrl: w.photoUrl, website: w.website,
            people: w.people.length, works: (w.works ?? []).length, cover: (w.works ?? []).find(x => x.imageUrl)?.imageUrl ?? '',
        }));
    }
});

/** Une fiche complète ; les personnes qui ont aussi un portrait dans la veille y sont reliées. */
export const get = query({
    args: { id: v.id('workshops') }, handler: async (ctx, { id }) => {
        await requireTrainee(ctx);
        const w = await ctx.db.get(id); if (!w) return null;
        const artists = await ctx.db.query('artists').collect();
        const byKey = new Map(artists.map(a => [a.nameKey, a._id]));
        const portrait = (name: string) => byKey.get(nameKey(name)) ?? null;
        return { ...w, works: w.works ?? [], founderLinks: w.founders.map(name => ({ name, artistId: portrait(name) })), peopleLinks: w.people.map(p => ({ ...p, artistId: portrait(p.name) })) };
    }
});

export const save = mutation({
    args: { id: v.optional(v.id('workshops')), data: v.object(workshopFields) }, handler: async (ctx, { id, data }) => {
        const me = await requireTrainee(ctx);
        const error = workshopError(data); if (error) throw new ConvexError(error);
        const key = nameKey(data.name), now = Date.now();
        const twin = await ctx.db.query('workshops').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        if (twin && twin._id !== id) throw new ConvexError(`${twin.name} est déjà dans la liste.`);
        if (id) { await ctx.db.patch(id, { ...data, name: data.name.trim(), nameKey: key, updatedAt: now }); return id; }
        return await ctx.db.insert('workshops', { ...data, name: data.name.trim(), nameKey: key, createdAt: now, updatedAt: now, authorName: authorOf(me) });
    }
});

export const remove = mutation({
    args: { id: v.id('workshops') }, handler: async (ctx, { id }) => { await requireTrainee(ctx); await ctx.db.delete(id); }
});

/**
 * Import d'une fiche préparée par Claude Code (data/veille/ateliers/*.json) :
 *   node scripts/veille-import.mjs --ateliers [--prod]
 * Une fiche du même nom est complétée, pas dupliquée.
 */
export const importWorkshop = internalMutation({
    args: { json: v.string() }, handler: async (ctx, { json }) => {
        const found = normalizeWorkshop(JSON.parse(json), newId);
        const error = workshopError(found); if (error) throw new ConvexError(error);
        const key = nameKey(found.name), now = Date.now();
        const twin = await ctx.db.query('workshops').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        if (twin) { await ctx.db.patch(twin._id, { ...mergeWorkshop(fieldsOf(twin), found), updatedAt: now }); return { id: twin._id, created: false }; }
        return { id: await ctx.db.insert('workshops', { ...found, nameKey: key, createdAt: now, updatedAt: now, authorName: 'Agent de veille' }), created: true };
    }
});
