import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { convexAuth, createAccount, retrieveAccount } from '@convex-dev/auth/server';

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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    providers: [ConvexCredentials({
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
