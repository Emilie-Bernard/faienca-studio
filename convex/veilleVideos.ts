import { query, mutation, internalMutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { videoFields } from './schema';
import { requireTrainee } from './access';
import { normalizeVideo, videoError, type VideoInput } from '../lib/veille';

// Documentaires et vidéos sur la broderie d'art, dans la Veille textile, notamment pour préparer le CAP.

const authorOf = (me: Awaited<ReturnType<typeof requireTrainee>>) => me.role === 'admin' ? 'L’atelier' : (me.user.name || me.user.email || 'Stagiaire');

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        return (await ctx.db.query('videos').collect()).sort((a, b) => b.createdAt - a.createdAt);
    }
});

export const save = mutation({
    args: { id: v.optional(v.id('videos')), data: v.object(videoFields) }, handler: async (ctx, { id, data }) => {
        const me = await requireTrainee(ctx);
        const error = videoError(data); if (error) throw new ConvexError(error);
        const twin = await ctx.db.query('videos').withIndex('by_url', q => q.eq('url', data.url)).first();
        if (twin && twin._id !== id) throw new ConvexError(`Cette vidéo est déjà dans la liste : « ${twin.title} ».`);
        const now = Date.now(), clean = { ...data, title: data.title.trim(), summary: data.summary.trim() };
        if (id) { await ctx.db.patch(id, { ...clean, updatedAt: now }); return id; }
        return await ctx.db.insert('videos', { ...clean, createdAt: now, updatedAt: now, authorName: authorOf(me) });
    }
});

export const remove = mutation({
    args: { id: v.id('videos') }, handler: async (ctx, { id }) => { await requireTrainee(ctx); await ctx.db.delete(id); }
});

/**
 * Import d'une liste de vidéos préparée par Claude Code (data/veille/videos.json) :
 *   node scripts/veille-import.mjs --videos [--prod]
 * Une vidéo déjà présente (même lien) n'est pas ajoutée deux fois.
 */
export const importVideos = internalMutation({
    args: { json: v.string() }, handler: async (ctx, { json }) => {
        const raw = JSON.parse(json) as unknown[];
        const items = (Array.isArray(raw) ? raw : []).map(normalizeVideo).filter((x): x is VideoInput => !!x && !videoError(x));
        let added = 0;
        for (const item of items) {
            if (await ctx.db.query('videos').withIndex('by_url', q => q.eq('url', item.url)).first()) continue;
            const now = Date.now();
            await ctx.db.insert('videos', { ...item, createdAt: now, updatedAt: now, authorName: 'Agent de veille' });
            added++;
        }
        return { found: items.length, added };
    }
});
