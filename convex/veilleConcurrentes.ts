import { query, mutation, internalMutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { competitorFields } from './schema';
import { requireTrainee } from './access';
import { competitorError, mergeCompetitor, nameKey, normalizeCompetitor, type CompetitorInput } from '../lib/veille';

// Concurrentes de Faïença (kits de broderie, patrons PDF) en France et en Espagne, dans la Veille textile.

const authorOf = (me: Awaited<ReturnType<typeof requireTrainee>>) => me.role === 'admin' ? 'L’atelier' : (me.user.name || me.user.email || 'Stagiaire');
const newId = () => crypto.randomUUID();
const fieldsOf = (c: Doc<'competitors'>): CompetitorInput => {
    const { _id, _creationTime, nameKey: _k, createdAt, updatedAt, authorName, ...rest } = c;
    void _id; void _creationTime; void _k; void createdAt; void updatedAt; void authorName;
    return rest;
};

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        const rows = await ctx.db.query('competitors').collect();
        return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(c => {
            const latest = c.financials.find(f => f.revenue !== null) ?? null;
            const instagram = c.audience.find(a => /instagram/i.test(a.platform))?.followers ?? null;
            return {
                _id: c._id, name: c.name, country: c.country, city: c.city, region: c.region, foundedDate: c.foundedDate, closedDate: c.closedDate,
                founders: c.founders, offers: c.offers, styles: c.styles, techniques: c.techniques, threads: c.threads, summary: c.summary, photoUrl: c.photoUrl,
                products: c.products.length, cover: (c.products.find(p => p.bestseller && p.imageUrl) ?? c.products.find(p => p.imageUrl))?.imageUrl ?? '',
                revenue: latest ? { year: latest.year, amount: latest.revenue } : null, instagram,
            };
        });
    }
});

export const get = query({
    args: { id: v.id('competitors') }, handler: async (ctx, { id }) => {
        await requireTrainee(ctx);
        return await ctx.db.get(id);
    }
});

export const save = mutation({
    args: { id: v.optional(v.id('competitors')), data: v.object(competitorFields) }, handler: async (ctx, { id, data }) => {
        const me = await requireTrainee(ctx);
        const error = competitorError(data); if (error) throw new ConvexError(error);
        const key = nameKey(data.name), now = Date.now();
        const twin = await ctx.db.query('competitors').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        if (twin && twin._id !== id) throw new ConvexError(`${twin.name} est déjà dans la liste.`);
        if (id) { await ctx.db.patch(id, { ...data, name: data.name.trim(), nameKey: key, updatedAt: now }); return id; }
        return await ctx.db.insert('competitors', { ...data, name: data.name.trim(), nameKey: key, createdAt: now, updatedAt: now, authorName: authorOf(me) });
    }
});

export const remove = mutation({
    args: { id: v.id('competitors') }, handler: async (ctx, { id }) => { await requireTrainee(ctx); await ctx.db.delete(id); }
});

/**
 * Import d'une fiche préparée par Claude Code (data/veille/concurrentes/*.json) :
 *   node scripts/veille-import.mjs --concurrentes [--prod]
 * Une fiche du même nom est complétée, pas dupliquée.
 */
export const importCompetitor = internalMutation({
    args: { json: v.string() }, handler: async (ctx, { json }) => {
        const found = normalizeCompetitor(JSON.parse(json), newId);
        const error = competitorError(found); if (error) throw new ConvexError(error);
        const key = nameKey(found.name), now = Date.now();
        const twin = await ctx.db.query('competitors').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        if (twin) { await ctx.db.patch(twin._id, { ...mergeCompetitor(fieldsOf(twin), found), updatedAt: now }); return { id: twin._id, created: false }; }
        return { id: await ctx.db.insert('competitors', { ...found, nameKey: key, createdAt: now, updatedAt: now, authorName: 'Agent de veille' }), created: true };
    }
});
