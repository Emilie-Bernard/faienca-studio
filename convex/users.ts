import { query, mutation, internalMutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAdmin, roleOf } from './access';

export const me = query({
    args: {}, handler: async (ctx) => {
        const id = await getAuthUserId(ctx); if (!id) return null;
        const user = await ctx.db.get(id); if (!user) return null;
        return { _id: user._id, name: user.name ?? '', email: user.email ?? '', role: roleOf(user)! };
    }
});

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const users = await ctx.db.query('users').order('desc').take(500);
        return await Promise.all(users.map(async u => ({
            _id: u._id, name: u.name ?? '', email: u.email ?? '', role: roleOf(u)!, locked: roleOf({ githubId: u.githubId }) === 'admin',
            createdAt: u.createdAt ?? u._creationTime,
            kits: (await ctx.db.query('kitProgress').withIndex('by_user', q => q.eq('userId', u._id)).collect()).length,
        })));
    }
});

export const setRole = mutation({
    args: { userId: v.id('users'), role: v.union(v.literal('admin'), v.literal('cliente')) }, handler: async (ctx, { userId, role }) => {
        const me = await requireAdmin(ctx);
        if (userId === me) throw new ConvexError('Vous ne pouvez pas modifier votre propre rôle.');
        const user = await ctx.db.get(userId); if (!user) throw new ConvexError('Compte introuvable.');
        if (roleOf({ githubId: user.githubId }) === 'admin') throw new ConvexError('Le compte de l’atelier reste administrateur.');
        await ctx.db.patch(userId, { role });
    }
});

/** Réservé à la ligne de commande : npx convex run users:setRoleByEmail '{"email":"…","role":"admin"}' */
export const setRoleByEmail = internalMutation({
    args: { email: v.string(), role: v.union(v.literal('admin'), v.literal('cliente')) }, handler: async (ctx, { email, role }) => {
        const user = await ctx.db.query('users').withIndex('email', q => q.eq('email', email.trim().toLowerCase())).unique();
        if (!user) throw new ConvexError('Aucun compte avec cette adresse.');
        await ctx.db.patch(user._id, { role });
        return { _id: user._id, email: user.email, role };
    }
});
