import { query, mutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { missionFile } from './schema';
import { requireAdmin } from './access';
import { cents, expenseError } from '../lib/expenses';

// Dépenses : visibles et modifiables par l'administratrice seulement.

const fields = { date: v.string(), supplier: v.string(), label: v.string(), category: v.string(), amount: v.number(), notes: v.string(), receipt: v.optional(missionFile) };

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const rows = await ctx.db.query('expenses').withIndex('by_date').order('desc').collect();
        return await Promise.all(rows.map(async e => ({
            _id: e._id, date: e.date, supplier: e.supplier, label: e.label, category: e.category, amount: e.amount, notes: e.notes,
            receipt: e.receipt ? { ...e.receipt, fileUrl: e.receipt.storageId ? await ctx.storage.getUrl(e.receipt.storageId) : null } : undefined,
        })));
    }
});

/** Ajoute une dépense, ou la remplace quand `id` est fourni. */
export const save = mutation({
    args: { id: v.optional(v.id('expenses')), data: v.object(fields) }, handler: async (ctx, { id, data }) => {
        await requireAdmin(ctx);
        const error = expenseError(data); if (error) throw new ConvexError(error);
        const clean = { ...data, supplier: data.supplier.trim(), label: data.label.trim(), notes: data.notes.trim(), amount: cents(data.amount), updatedAt: Date.now() };
        if (!id) return await ctx.db.insert('expenses', { ...clean, createdAt: Date.now() });
        const before = await ctx.db.get(id); if (!before) throw new ConvexError('Dépense introuvable.');
        // Justificatif remplacé ou retiré : l'ancien fichier ne sert plus.
        if (before.receipt?.storageId && before.receipt.storageId !== data.receipt?.storageId) await ctx.storage.delete(before.receipt.storageId);
        await ctx.db.replace(id, { ...clean, createdAt: before.createdAt });
        return id;
    }
});

export const remove = mutation({
    args: { id: v.id('expenses') }, handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        const e = await ctx.db.get(id); if (!e) return;
        if (e.receipt?.storageId) await ctx.storage.delete(e.receipt.storageId);
        await ctx.db.delete(id);
    }
});

export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); }
});
