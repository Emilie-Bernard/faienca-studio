import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { localizeKit } from '../lib/kits';
import { releaseEmail } from '../lib/release-email';

/** Resend accepte jusqu'à 100 e-mails par appel groupé. */
const BATCH = 100;

export const recipients = internalQuery({
    args: { kitId: v.id('kits') }, handler: async (ctx, { kitId }) => {
        const kit = await ctx.db.get(kitId);
        if (!kit || !kit.published) return null;
        const waiting = (await ctx.db.query('kitProgress').withIndex('by_kit', q => q.eq('kitId', kitId)).collect()).filter(p => p.awaitingRelease);
        const people = [];
        for (const p of waiting) {
            const user = await ctx.db.get(p.userId);
            if (user?.email) people.push({ progressId: p._id, email: user.email, firstName: user.name?.trim().split(/\s+/)[0] ?? '', locale: user.locale ?? 'fr' });
        }
        return { kit: { title: kit.title, description: kit.description, coverUrl: kit.coverUrl, translations: kit.translations }, people };
    }
});

export const markNotified = internalMutation({
    args: { progressIds: v.array(v.id('kitProgress')) }, handler: async (ctx, { progressIds }) => {
        const now = Date.now();
        for (const id of progressIds) if (await ctx.db.get(id)) await ctx.db.patch(id, { awaitingRelease: undefined, notifiedAt: now });
    }
});

/** Prévient par e-mail les clientes qui avaient ajouté le kit pendant qu'il était « À venir ». */
export const notify = internalAction({
    args: { kitId: v.id('kits') }, handler: async (ctx, { kitId }) => {
        const data = await ctx.runQuery(internal.kitRelease.recipients, { kitId });
        if (!data || !data.people.length) return { sent: 0 };
        const apiKey = process.env.AUTH_RESEND_KEY;
        if (!apiKey) throw new Error('AUTH_RESEND_KEY manquant : impossible de prévenir les clientes.');
        const site = process.env.SITE_URL?.replace(/\/+$/, '');
        if (!site) throw new Error('SITE_URL manquant : impossible de construire le lien vers le kit.');
        const from = process.env.AUTH_EMAIL_FROM || 'Faïença <onboarding@resend.dev>';
        let sent = 0;
        for (let i = 0; i < data.people.length; i += BATCH) {
            const chunk = data.people.slice(i, i + BATCH);
            const emails = chunk.map(p => {
                const { title } = localizeKit(data.kit, p.locale);
                const { subject, text, html } = releaseEmail({ locale: p.locale, firstName: p.firstName, kitTitle: title, coverUrl: data.kit.coverUrl, kitUrl: `${site}/?kit=${kitId}`, logoUrl: `${site}/brand/logo-email.png` });
                return { from, to: [p.email], subject, text, html };
            });
            const res = await fetch('https://api.resend.com/emails/batch', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `kit-release-${kitId}-${chunk[0]!.progressId}` },
                body: JSON.stringify(emails),
            });
            if (!res.ok) throw new Error(`Resend a refusé l’envoi (${res.status}) : ${await res.text()}`);
            await ctx.runMutation(internal.kitRelease.markNotified, { progressIds: chunk.map(p => p.progressId) });
            sent += chunk.length;
        }
        return { sent };
    }
});
