import { query, mutation, type MutationCtx } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin } from './access';
import { pdfLanguages, productError, type ProductInput } from '../lib/products';

const productData = v.object({
    type: v.union(v.literal('kit'), v.literal('pdf')), title: v.string(), description: v.string(), status: v.string(),
    price: v.union(v.number(), v.null()), shopUrl: v.string(), coverUrl: v.string(), linkedKitId: v.string(),
    contents: v.array(v.object({ id: v.string(), name: v.string(), notes: v.string() })),
    materials: v.array(v.object({
        id: v.string(), name: v.string(), quantity: v.string(), purpose: v.union(v.literal('kit'), v.literal('atelier')),
        unitCost: v.union(v.number(), v.null()), bought: v.boolean(), notes: v.string(),
        links: v.array(v.object({ id: v.string(), shop: v.string(), url: v.string(), note: v.string() })),
    })),
    pdfs: v.object({
        fr: v.optional(v.object({ id: v.string(), label: v.string(), url: v.string(), storageId: v.optional(v.id('_storage')) })),
        en: v.optional(v.object({ id: v.string(), label: v.string(), url: v.string(), storageId: v.optional(v.id('_storage')) })),
        es: v.optional(v.object({ id: v.string(), label: v.string(), url: v.string(), storageId: v.optional(v.id('_storage')) })),
    }),
    tasks: v.array(v.object({ id: v.string(), title: v.string(), done: v.boolean() })),
});

const storageIds = (pdfs: Doc<'products'>['pdfs']) => pdfLanguages.map(l => pdfs[l]?.storageId).filter((s): s is Id<'_storage'> => !!s);
const deleteFiles = async (ctx: MutationCtx, ids: Id<'_storage'>[], keep = new Set<string>()) => { for (const id of ids) if (!keep.has(id)) await ctx.storage.delete(id); };

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const products = await ctx.db.query('products').order('desc').collect();
        return await Promise.all(products.map(async p => ({
            ...p, pdfs: Object.fromEntries(await Promise.all(pdfLanguages.flatMap(l => p.pdfs[l] ? [(async () => [l, { ...p.pdfs[l]!, fileUrl: p.pdfs[l]!.storageId ? await ctx.storage.getUrl(p.pdfs[l]!.storageId!) : null }] as const)()] : []))),
        })));
    }
});

export const save = mutation({
    args: { id: v.optional(v.id('products')), revision: v.optional(v.number()), data: productData }, handler: async (ctx, { id, revision, data }) => {
        await requireAdmin(ctx);
        const error = productError(data as ProductInput); if (error) throw new ConvexError(error);
        const clean = { ...data, title: data.title.trim() };
        if (!id) return await ctx.db.insert('products', { ...clean, revision: 1, updatedAt: Date.now() });
        const before = await ctx.db.get(id); if (!before) throw new ConvexError('Produit introuvable.');
        if (before.revision !== revision) throw new ConvexError('Ce produit a été modifié dans une autre session. Rechargez-le avant d’enregistrer.');
        await deleteFiles(ctx, storageIds(before.pdfs), new Set(storageIds(clean.pdfs)));
        await ctx.db.patch(id, { ...clean, revision: before.revision + 1, updatedAt: Date.now() });
        return id;
    }
});

export const remove = mutation({
    args: { id: v.id('products'), revision: v.number() }, handler: async (ctx, { id, revision }) => {
        await requireAdmin(ctx);
        const product = await ctx.db.get(id); if (!product) throw new ConvexError('Produit introuvable.');
        if (product.revision !== revision) throw new ConvexError('Ce produit a changé. Rechargez-le.');
        await deleteFiles(ctx, storageIds(product.pdfs));
        await ctx.db.delete(id);
    }
});

export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); }
});
