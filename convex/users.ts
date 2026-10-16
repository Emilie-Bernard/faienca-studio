import { query, mutation, internalMutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAdmin, roleOf } from './access';
import { kitStatus } from '../lib/kits';

export const me = query({
    args: {}, handler: async (ctx) => {
        const id = await getAuthUserId(ctx); if (!id) return null;
        const user = await ctx.db.get(id); if (!user) return null;
        return { _id: user._id, name: user.name ?? '', email: user.email ?? '', role: roleOf(user)! };
    }
});

/** Une nouvelle visite commence après 30 minutes sans activité. */
const VISIT_GAP = 30 * 60 * 1000;
/** On n'écrit pas plus d'une fois toutes les 5 minutes pour la même personne. */
const PING_THROTTLE = 5 * 60 * 1000;
const LOCALES = ['fr', 'en', 'es'];

/** Appelé à l'ouverture de l'espace : date la dernière connexion et retient la langue de l'interface. */
export const ping = mutation({
    args: { locale: v.optional(v.string()) }, handler: async (ctx, { locale }) => {
        const id = await getAuthUserId(ctx); if (!id) return;
        const user = await ctx.db.get(id); if (!user) return;
        const now = Date.now(), last = user.lastSeenAt ?? 0;
        const lang = locale && LOCALES.includes(locale) ? locale : user.locale;
        if (now - last < PING_THROTTLE && lang === user.locale) return;
        await ctx.db.patch(id, { lastSeenAt: now, visits: (user.visits ?? 0) + (now - last > VISIT_GAP ? 1 : 0), ...(lang ? { locale: lang } : {}) });
    }
});

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const users = await ctx.db.query('users').order('desc').take(500);
        const kits = new Map((await ctx.db.query('kits').collect()).map(k => [k._id, k]));
        return await Promise.all(users.map(async u => {
            const progress = await ctx.db.query('kitProgress').withIndex('by_user', q => q.eq('userId', u._id)).collect();
            return {
                _id: u._id, name: u.name ?? '', email: u.email ?? '', role: roleOf(u)!, locked: roleOf({ githubId: u.githubId }) === 'admin',
                createdAt: u.createdAt ?? u._creationTime, lastSeenAt: u.lastSeenAt ?? null, visits: u.visits ?? 0,
                kits: progress.flatMap(p => {
                    const kit = kits.get(p.kitId); if (!kit) return [];
                    return [{
                        kitId: p.kitId, title: kit.title, status: kitStatus(kit), source: p.source ?? 'code',
                        done: kit.lessons.filter(l => p.completed.includes(l.id)).length, total: kit.lessons.length,
                        startedAt: p.startedAt, updatedAt: p.updatedAt, finishedAt: p.finishedAt ?? null,
                        awaitingRelease: !!p.awaitingRelease, notifiedAt: p.notifiedAt ?? null,
                    }];
                }).sort((a, b) => b.updatedAt - a.updatedAt),
            };
        }));
    }
});

export const setRole = mutation({
    args: { userId: v.id('users'), role: v.union(v.literal('admin'), v.literal('cliente'), v.literal('stagiaire')) }, handler: async (ctx, { userId, role }) => {
        const me = await requireAdmin(ctx);
        if (userId === me) throw new ConvexError('Vous ne pouvez pas modifier votre propre rôle.');
        const user = await ctx.db.get(userId); if (!user) throw new ConvexError('Compte introuvable.');
        if (roleOf({ githubId: user.githubId }) === 'admin') throw new ConvexError('Le compte de l’atelier reste administrateur.');
        await ctx.db.patch(userId, { role });
    }
});

/** Réservé à la ligne de commande : npx convex run users:setRoleByEmail '{"email":"…","role":"admin"}' */
export const setRoleByEmail = internalMutation({
    args: { email: v.string(), role: v.union(v.literal('admin'), v.literal('cliente'), v.literal('stagiaire')) }, handler: async (ctx, { email, role }) => {
        const user = await ctx.db.query('users').withIndex('email', q => q.eq('email', email.trim().toLowerCase())).unique();
        if (!user) throw new ConvexError('Aucun compte avec cette adresse.');
        await ctx.db.patch(user._id, { role });
        return { _id: user._id, email: user.email, role };
    }
});
