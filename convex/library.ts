import { query, mutation } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { missionFile } from './schema';
import { requireTrainee } from './access';
import { libraryError } from '../lib/library';

// Bibliothèque partagée : l'atelier et les stagiaires y déposent fichiers et liens.

export const list = query({
    args: {}, handler: async (ctx) => {
        const me = await requireTrainee(ctx);
        const items = await ctx.db.query('libraryItems').order('desc').collect();
        return await Promise.all(items.map(async d => ({
            _id: d._id, title: d.title, category: d.category, description: d.description, authorName: d.authorName, createdAt: d.createdAt,
            file: { ...d.file, fileUrl: d.file.storageId ? await ctx.storage.getUrl(d.file.storageId) : null },
            canRemove: me.role === 'admin' || d.authorId === me.id,
        })));
    }
});

export const add = mutation({
    args: { title: v.string(), category: v.string(), description: v.string(), file: missionFile }, handler: async (ctx, data) => {
        const me = await requireTrainee(ctx);
        const error = libraryError(data); if (error) throw new ConvexError(error);
        const authorName = me.role === 'admin' ? 'L’atelier' : (me.user.name || me.user.email || 'Stagiaire');
        return await ctx.db.insert('libraryItems', {
            title: data.title.trim(), category: data.category.trim(), description: data.description.trim(),
            file: { ...data.file, label: data.file.label.trim() }, authorId: me.id, authorName, createdAt: Date.now(),
        });
    }
});

/** L'atelier peut tout retirer ; une stagiaire, seulement ce qu'elle a ajouté. */
export const remove = mutation({
    args: { id: v.id('libraryItems') }, handler: async (ctx, { id }) => {
        const me = await requireTrainee(ctx);
        const item = await ctx.db.get(id); if (!item) return;
        if (me.role !== 'admin' && item.authorId !== me.id) throw new ConvexError('Seule l’atelier ou la personne qui l’a ajouté peut retirer ce document.');
        if (item.file.storageId) await ctx.storage.delete(item.file.storageId);
        await ctx.db.delete(id);
    }
});

export const generateUploadUrl = mutation({
    args: {}, handler: async (ctx) => { await requireTrainee(ctx); return await ctx.storage.generateUploadUrl(); }
});
