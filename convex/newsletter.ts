import { queryGeneric as query, mutationGeneric as mutation, type GenericQueryCtx, type GenericDataModel } from 'convex/server';
import { paginationOptsValidator } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

const subscriberStatus = v.union(v.literal('pending'), v.literal('subscribed'), v.literal('unsubscribed'));

const subscriberDoc = v.object({
  _id: v.id('newsletterSubscribers'),
  _creationTime: v.number(),
  email: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  status: subscriberStatus,
  source: v.string(),
  klaviyoJobId: v.optional(v.string()),
  lastError: v.optional(v.string()),
});

async function owner(ctx: GenericQueryCtx<GenericDataModel>) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError('Connexion requise.');
  const user = await ctx.db.get(id);
  if (user?.githubId !== (process.env.OWNER_GITHUB_ID || 'owner')) throw new ConvexError('Accès réservé à la propriétaire.');
  return id;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertValidEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ConvexError('Adresse e-mail invalide.');
}

export const upsertSubscriber = mutation({
  args: {
    secret: v.string(),
    email: v.string(),
    status: subscriberStatus,
    source: v.string(),
    klaviyoJobId: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  returns: v.id('newsletterSubscribers'),
  handler: async (ctx, args) => {
    const expected = process.env.NEWSLETTER_INGEST_SECRET;
    if (!expected || args.secret !== expected) throw new ConvexError('Non autorisé.');
    const email = normalizeEmail(args.email);
    assertValidEmail(email);
    const now = Date.now();
    const existing = await ctx.db.query('newsletterSubscribers').withIndex('by_email', q => q.eq('email', email)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        source: args.source,
        updatedAt: now,
        klaviyoJobId: args.klaviyoJobId,
        lastError: args.lastError,
      });
      return existing._id;
    }
    return await ctx.db.insert('newsletterSubscribers', {
      email,
      createdAt: now,
      updatedAt: now,
      status: args.status,
      source: args.source,
      klaviyoJobId: args.klaviyoJobId,
      lastError: args.lastError,
    });
  },
});

export const listSubscribers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(subscriberDoc),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await owner(ctx);
    return await ctx.db.query('newsletterSubscribers').order('desc').paginate(args.paginationOpts);
  },
});
