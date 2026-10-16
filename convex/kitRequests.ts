import { query, mutation, internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v, ConvexError } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireAdmin, requireUser, roleOf } from './access';
import { localizeKit } from '../lib/kits';
import { adminRequestsEmail, requestAcceptedEmail } from '../lib/request-email';

const MAX_PENDING = 5;

// ——— Espace cliente ———

/** Statut des demandes de la cliente, kit par kit (la plus récente). */
export const mine = query({
    args: {}, handler: async (ctx) => {
        const me = await requireUser(ctx);
        const rows = await ctx.db.query('kitRequests').withIndex('by_user_kit', q => q.eq('userId', me.id)).collect();
        const latest: Record<string, 'pending' | 'accepted' | 'refused'> = {};
        for (const r of rows.sort((a, b) => a.createdAt - b.createdAt)) latest[r.kitId] = r.status;
        return latest;
    }
});

/** Demande d'activation sans code : l'administratrice est prévenue par e-mail. */
export const request = mutation({
    args: { kitId: v.id('kits'), message: v.string() }, handler: async (ctx, { kitId, message }) => {
        const me = await requireUser(ctx);
        const kit = await ctx.db.get(kitId);
        if (!kit || !(kit.published || kit.upcoming)) throw new ConvexError('Kit introuvable.');
        const text = message.trim();
        if (text.length > 1000) throw new ConvexError('Votre message ne peut pas dépasser 1 000 caractères.');
        const owned = await ctx.db.query('kitProgress').withIndex('by_user_kit', q => q.eq('userId', me.id).eq('kitId', kitId)).unique();
        if (owned) throw new ConvexError('Ce kit est déjà dans votre carnet.');
        const mineRows = await ctx.db.query('kitRequests').withIndex('by_user_kit', q => q.eq('userId', me.id)).collect();
        const existing = mineRows.find(r => r.kitId === kitId && r.status === 'pending');
        if (existing) return existing._id;
        if (mineRows.filter(r => r.status === 'pending').length >= MAX_PENDING) throw new ConvexError('Vous avez déjà plusieurs demandes en attente. Nous vous répondons au plus vite.');
        const id = await ctx.db.insert('kitRequests', { userId: me.id, kitId, message: text, status: 'pending', createdAt: Date.now() });
        await ctx.scheduler.runAfter(0, internal.kitRequests.notifyAdmin, { requestId: id });
        return id;
    }
});

// ——— Atelier ———

export const list = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const rows = await ctx.db.query('kitRequests').order('desc').take(300);
        return await Promise.all(rows.map(async r => {
            const [user, kit] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.kitId)]);
            return { _id: r._id, status: r.status, message: r.message, createdAt: r.createdAt, decidedAt: r.decidedAt ?? null, name: user?.name ?? '', email: user?.email ?? '', kitId: r.kitId, kitTitle: kit?.title ?? 'Kit supprimé', kitPublished: !!kit?.published };
        }));
    }
});

/** Accepter : le kit entre dans le carnet de la cliente, qui reçoit un e-mail. Refuser : la demande est close, sans e-mail. */
export const decide = mutation({
    args: { id: v.id('kitRequests'), accept: v.boolean() }, handler: async (ctx, { id, accept }) => {
        await requireAdmin(ctx);
        const r = await ctx.db.get(id); if (!r) throw new ConvexError('Demande introuvable.');
        if (r.status !== 'pending') throw new ConvexError('Cette demande a déjà reçu une réponse.');
        const kit = await ctx.db.get(r.kitId); if (accept && !kit) throw new ConvexError('Ce kit a été supprimé.');
        await ctx.db.patch(id, { status: accept ? 'accepted' : 'refused', decidedAt: Date.now() });
        if (!accept || !kit) return;
        const existing = await ctx.db.query('kitProgress').withIndex('by_user_kit', q => q.eq('userId', r.userId).eq('kitId', r.kitId)).unique();
        if (!existing) {
            const now = Date.now();
            await ctx.db.insert('kitProgress', { userId: r.userId, kitId: kit._id, completed: [], notes: '', startedAt: now, updatedAt: now, source: 'admin', ...(kit.published ? {} : { awaitingRelease: true }) });
        }
        await ctx.scheduler.runAfter(0, internal.kitRequests.notifyAccepted, { requestId: id });
    }
});

// ——— E-mails ———

export const adminData = internalQuery({
    args: { requestId: v.id('kitRequests') }, handler: async (ctx, { requestId }) => {
        const describe = async (r: { userId: Id<'users'>; kitId: Id<'kits'>; message: string; createdAt: number }) => {
            const [user, kit] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.kitId)]);
            return { name: user?.name ?? '', email: user?.email ?? '', kitTitle: kit?.title ?? 'Kit supprimé', message: r.message, createdAt: r.createdAt };
        };
        const r = await ctx.db.get(requestId); if (!r) return null;
        const pending = await ctx.db.query('kitRequests').withIndex('by_status', q => q.eq('status', 'pending')).order('desc').take(30);
        const admins = (await ctx.db.query('users').collect()).filter(u => roleOf(u) === 'admin' && u.email).map(u => u.email!);
        return { latest: await describe(r), pending: await Promise.all(pending.map(describe)), admins };
    }
});

export const acceptedData = internalQuery({
    args: { requestId: v.id('kitRequests') }, handler: async (ctx, { requestId }) => {
        const r = await ctx.db.get(requestId); if (!r) return null;
        const [user, kit] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.kitId)]);
        if (!user?.email || !kit) return null;
        return { email: user.email, firstName: user.name?.trim().split(/\s+/)[0] ?? '', locale: user.locale ?? 'fr', kit: { title: kit.title, description: kit.description, coverUrl: kit.coverUrl, translations: kit.translations, published: kit.published, _id: kit._id } };
    }
});

async function send(email: { to: string[]; subject: string; text: string; html: string }, idempotencyKey: string) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) throw new Error('AUTH_RESEND_KEY manquant : impossible d’envoyer l’e-mail.');
    const from = process.env.AUTH_EMAIL_FROM || 'Faïença <onboarding@resend.dev>';
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from, ...email }),
    });
    if (!res.ok) throw new Error(`Resend a refusé l’envoi (${res.status}) : ${await res.text()}`);
}

const siteUrl = () => {
    const site = process.env.SITE_URL?.replace(/\/+$/, '');
    if (!site) throw new Error('SITE_URL manquant : impossible de construire les liens de l’e-mail.');
    return site;
};

/** Prévient l'administratrice (ADMIN_EMAIL, sinon les comptes Admin) avec la liste des demandes en attente. */
export const notifyAdmin = internalAction({
    args: { requestId: v.id('kitRequests') }, handler: async (ctx, { requestId }) => {
        const data = await ctx.runQuery(internal.kitRequests.adminData, { requestId });
        if (!data) return;
        const to = (process.env.ADMIN_EMAIL ?? '').split(',').map(s => s.trim()).filter(Boolean);
        const recipients = to.length ? to : data.admins;
        if (!recipients.length) throw new Error('Aucune adresse administratrice : renseignez ADMIN_EMAIL.');
        const site = siteUrl();
        const { subject, text, html } = adminRequestsEmail({ latest: data.latest, pending: data.pending, studioUrl: `${site}/?vue=Demandes`, logoUrl: `${site}/brand/logo-email.png` });
        await send({ to: recipients, subject, text, html }, `kit-request-${requestId}`);
    }
});

export const notifyAccepted = internalAction({
    args: { requestId: v.id('kitRequests') }, handler: async (ctx, { requestId }) => {
        const data = await ctx.runQuery(internal.kitRequests.acceptedData, { requestId });
        if (!data) return;
        const site = siteUrl();
        const { title } = localizeKit(data.kit, data.locale);
        const { subject, text, html } = requestAcceptedEmail({ locale: data.locale, firstName: data.firstName, kitTitle: title, coverUrl: data.kit.coverUrl, kitUrl: data.kit.published ? `${site}/?kit=${data.kit._id}` : site, logoUrl: `${site}/brand/logo-email.png`, upcoming: !data.kit.published });
        await send({ to: [data.email], subject, text, html }, `kit-request-accepted-${requestId}`);
    }
});
