import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { convexAuth, createAccount, retrieveAccount } from '@convex-dev/auth/server';

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
            const expected = process.env.STUDIO_PASSWORD;
            const owner = process.env.OWNER_GITHUB_ID;
            const given = typeof credentials.password === 'string' ? credentials.password : '';
            if (!expected || !owner) throw new Error('Connexion non configurée.');
            if (!given || !sameSecret(given, expected)) throw new Error('Mot de passe incorrect.');
            const existing = await retrieveAccount(ctx, { provider: 'password', account: { id: 'owner' } });
            if (existing !== null) return { userId: existing.user._id };
            const created = await createAccount(ctx, {
                provider: 'password',
                account: { id: 'owner' },
                profile: { name: 'Émilie', githubId: owner },
            });
            return { userId: created.user._id };
        },
    })],
});
