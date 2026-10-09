import { queryGeneric as query, mutationGeneric as mutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { requireAdmin } from './access';

/** Nombre maximum de tâches dans la liste d'une journée (reportées et terminées du jour comprises). */
export const DAILY_LIMIT = 5;

// Le jour vient du navigateur (fuseau Europe/Paris côté client) : on vérifie seulement son format.
function checkDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new ConvexError('Date invalide.');
}

async function dayList(ctx: any, today: string) {
    const open = await ctx.db.query('todos').withIndex('by_doneDay', (q: any) => q.eq('doneDay', undefined)).collect();
    const done = await ctx.db.query('todos').withIndex('by_doneDay', (q: any) => q.eq('doneDay', today)).collect();
    return [...open.filter((t: any) => t.day <= today), ...done].sort((a: any, b: any) => a.createdAt - b.createdAt);
}

export const today = query({
    args: { today: v.string() }, handler: async (ctx, { today }) => {
        await requireAdmin(ctx); checkDay(today);
        return (await dayList(ctx, today)).map((t: any) => ({ _id: t._id, title: t.title, day: t.day, done: t.doneDay !== undefined }));
    }
});

export const add = mutation({
    args: { title: v.string(), today: v.string() }, handler: async (ctx, { title, today }) => {
        await requireAdmin(ctx); checkDay(today);
        const clean = title.trim();
        if (!clean || clean.length > 200) throw new ConvexError('La tâche doit contenir entre 1 et 200 caractères.');
        if ((await dayList(ctx, today)).length >= DAILY_LIMIT) throw new ConvexError(`${DAILY_LIMIT} tâches maximum par jour : terminez-en une avant d’en ajouter.`);
        return await ctx.db.insert('todos', { title: clean, day: today, createdAt: Date.now() });
    }
});

export const toggle = mutation({
    args: { id: v.id('todos'), today: v.string() }, handler: async (ctx, { id, today }) => {
        await requireAdmin(ctx); checkDay(today);
        const t = await ctx.db.get(id); if (!t) throw new ConvexError('Tâche introuvable.');
        await ctx.db.patch(id, t.doneDay === undefined ? { doneDay: today, doneAt: Date.now() } : { doneDay: undefined, doneAt: undefined });
    }
});

export const remove = mutation({
    args: { id: v.id('todos') }, handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        if (await ctx.db.get(id)) await ctx.db.delete(id);
    }
});
