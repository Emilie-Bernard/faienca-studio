import type { GenericQueryCtx } from 'convex/server';
import { ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';
import type { Role } from '../lib/kits';

// Accepte aussi bien les contextes typés que les contextes génériques des fichiers existants.
type Ctx = GenericQueryCtx<any>;
type User = Doc<'users'>;

/** Le compte d'atelier historique (mot de passe STUDIO_PASSWORD) reste toujours administratrice. */
export function roleOf(user: Pick<User, 'role' | 'githubId'> | null): Role | null {
    if (!user) return null;
    if (user.githubId && user.githubId === (process.env.OWNER_GITHUB_ID || 'owner')) return 'admin';
    return user.role ?? 'cliente';
}

export async function requireUser(ctx: Ctx) {
    const id = await getAuthUserId(ctx); if (!id) throw new ConvexError('Connexion requise.');
    const user = await ctx.db.get(id) as User | null; if (!user) throw new ConvexError('Connexion requise.');
    return { id: id as Id<'users'>, user, role: roleOf(user)! };
}

export async function requireAdmin(ctx: Ctx) {
    const me = await requireUser(ctx);
    if (me.role !== 'admin') throw new ConvexError('Accès réservé à la propriétaire.');
    return me.id;
}
