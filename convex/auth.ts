import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { Password } from '@convex-dev/auth/providers/Password';
import { Email } from '@convex-dev/auth/providers/Email';
import { convexAuth, createAccount, retrieveAccount } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { makeFunctionReference, type GenericActionCtx } from 'convex/server';
import { normalizeEmail, isValidEmail } from '../lib/newsletter';
import { randomDigits, resetEmail } from '../lib/reset-email';

const studioPassword = process.env.STUDIO_PASSWORD;
const ownerId = process.env.OWNER_GITHUB_ID || 'owner';

function sameSecret(a: string, b: string) {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
    return diff === 0;
}

const RESET_MINUTES = 15;
// Référence par nom pour éviter une dépendance circulaire avec les types générés.
const localeByEmail = makeFunctionReference<'query', { email: string }, string | null>('users:localeByEmail');

// Mot de passe oublié : un code à 8 chiffres envoyé par Resend (AUTH_RESEND_KEY, AUTH_EMAIL_FROM).
const resetByEmail = Email({
    id: 'reset-email',
    apiKey: process.env.AUTH_RESEND_KEY,
    maxAge: RESET_MINUTES * 60,
    generateVerificationToken: async () => randomDigits(8),
    sendVerificationRequest: async ({ identifier, token, provider }, ctx?: { runQuery: GenericActionCtx<any>['runQuery'] }) => {
        if (!provider.apiKey) throw new ConvexError('L’envoi d’e-mails n’est pas encore configuré.');
        // L'e-mail part dans la langue de l'interface retenue lors des dernières visites de la cliente.
        const locale = ctx ? await ctx.runQuery(localeByEmail, { email: identifier }).catch(() => null) : null;
        const { subject, text, html } = resetEmail(token, RESET_MINUTES, locale ?? undefined);
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM || 'Faïença <onboarding@resend.dev>', to: [identifier], subject, text, html }),
        });
        if (!res.ok) throw new Error(`Resend a refusé l’envoi (${res.status}) : ${await res.text()}`);
    },
});

// Comptes clientes : e-mail + mot de passe. Le rôle n'est jamais lu depuis le formulaire.
const accounts = Password({
    id: 'compte',
    profile: params => {
        const email = normalizeEmail(typeof params.email === 'string' ? params.email : '');
        if (!isValidEmail(email)) throw new ConvexError('Adresse e-mail invalide.');
        const name = typeof params.name === 'string' ? params.name.trim().slice(0, 80) : '';
        return name ? { email, name } : { email } as { email: string };
    },
    validatePasswordRequirements: password => {
        if (password.length < 8 || password.length > 200) throw new ConvexError('Le mot de passe doit contenir au moins 8 caractères.');
    },
    reset: resetByEmail,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    callbacks: {
        afterUserCreatedOrUpdated: async (ctx, { userId, existingUserId }) => {
            if (existingUserId) return;
            const user = await ctx.db.get(userId);
            if (user && !user.role) await ctx.db.patch(userId, { role: user.githubId ? 'admin' : 'cliente', createdAt: Date.now() });
        },
    },
    providers: [accounts, ConvexCredentials({
        id: 'password',
        authorize: async (credentials, ctx) => {
            const given = typeof credentials.password === 'string' ? credentials.password : '';
            if (!studioPassword) throw new Error('Connexion non configurée.');
            if (!given || !sameSecret(given, studioPassword)) throw new Error('Mot de passe incorrect.');
            try {
                const existing = await retrieveAccount(ctx, { provider: 'password', account: { id: 'owner' } });
                return { userId: existing.user._id };
            } catch (error) {
                if (!(error instanceof Error) || error.message !== 'InvalidAccountId') throw error;
            }
            const created = await createAccount(ctx, {
                provider: 'password',
                account: { id: 'owner' },
                profile: { name: 'Émilie', githubId: ownerId },
            });
            return { userId: created.user._id };
        },
    })],
});
