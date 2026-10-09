import { v, ConvexError } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { wrapEmailHtml } from '../lib/klaviyo-sync';
import { isValidTestRecipient, previewMergeTags, testSubject } from '../lib/test-email';

/**
 * Envoie la version enregistrée d'une newsletter (ou d'un e-mail de scénario) à une adresse de test, via Resend.
 * Réutilise la clé Resend de l'authentification (AUTH_RESEND_KEY) ; l'expéditeur est NEWSLETTER_TEST_FROM,
 * sinon AUTH_EMAIL_FROM. Réservé à l'administratrice (vérifié par loadEntryForSync).
 */
export const sendTest = action({
    args: {
        entryId: v.id('entries'),
        revision: v.number(),
        kind: v.union(v.literal('newsletter'), v.literal('scenario')),
        stepId: v.optional(v.string()),
        to: v.string(),
    },
    returns: v.object({ to: v.string() }),
    handler: async (ctx, args) => {
        const to = args.to.trim();
        if (!isValidTestRecipient(to)) throw new ConvexError('Adresse e-mail de test invalide.');
        const entry = await ctx.runQuery(internal.klaviyoSync.loadEntryForSync, { entryId: args.entryId, revision: args.revision, kind: args.kind });

        let subject = entry.hook || entry.title;
        let body = entry.text;
        if (args.kind === 'scenario') {
            const step = (args.stepId && entry.emailSteps.find(s => s.id === args.stepId)) || entry.emailSteps[0];
            if (!step) throw new ConvexError('Ce scénario ne contient aucun e-mail.');
            subject = step.subject || entry.title;
            body = step.body;
        }
        if (!body.trim()) throw new ConvexError('Le corps de l’e-mail est vide.');

        const apiKey = process.env.AUTH_RESEND_KEY;
        if (!apiKey) throw new ConvexError('Resend n’est pas configuré. Ajoutez AUTH_RESEND_KEY dans Convex.');
        const from = process.env.NEWSLETTER_TEST_FROM || process.env.AUTH_EMAIL_FROM || 'Faïença <onboarding@resend.dev>';

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [to], subject: testSubject(subject), html: wrapEmailHtml(previewMergeTags(body, 'Émilie')) }),
        });
        if (!res.ok) throw new ConvexError(`Resend a refusé l’envoi (${res.status}) : ${(await res.text()).slice(0, 300)}`);
        return { to };
    },
});
