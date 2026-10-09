import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
const emailSteps = v.array(v.object({
    id: v.string(), delayDays: v.number(), subject: v.string(), body: v.string(),
    klaviyoTemplateId: v.optional(v.string()),
    klaviyoFlowActionId: v.optional(v.string()),
    klaviyoDelayActionId: v.optional(v.string()),
}));
export const lessonFields = v.object({
    id: v.string(), title: v.string(), stitch: v.string(), videoUrl: v.string(),
    videoStorageId: v.optional(v.id('_storage')), notes: v.string(),
});
export const kitFields = {
    title: v.string(), description: v.string(), coverUrl: v.string(), accessCode: v.string(),
    published: v.boolean(), lessons: v.array(lessonFields),
};
export const entryFields = {
    kind: v.union(v.literal('publication'), v.literal('projet'), v.literal('strategie'), v.literal('newsletter'), v.literal('scenario')),
    title: v.string(), text: v.string(), status: v.string(), date: v.string(), channel: v.string(), format: v.string(), objective: v.string(), hook: v.string(), cta: v.string(), stories: v.string(), offer: v.string(), projectId: v.string(), stage: v.string(), priority: v.string(), category: v.string(),
    tasks: v.array(v.object({ id: v.string(), title: v.string(), done: v.boolean() })),
    emailSteps,
    klaviyoCampaignId: v.optional(v.string()),
    klaviyoCampaignMessageId: v.optional(v.string()),
    klaviyoTemplateId: v.optional(v.string()),
    klaviyoFlowId: v.optional(v.string()),
    klaviyoFlowStructure: v.optional(v.string()),
    url: v.string(), caveat: v.string(), original: v.string(),
    reach: v.union(v.number(), v.null()), saves: v.union(v.number(), v.null()), shares: v.union(v.number(), v.null()), clicks: v.union(v.number(), v.null()), orders: v.union(v.number(), v.null()),
};
export default defineSchema({
    ...authTables,
    users: defineTable({ name: v.optional(v.string()), email: v.optional(v.string()), image: v.optional(v.string()), emailVerificationTime: v.optional(v.number()), phone: v.optional(v.string()), phoneVerificationTime: v.optional(v.number()), isAnonymous: v.optional(v.boolean()), githubId: v.optional(v.string()), role: v.optional(v.union(v.literal('admin'), v.literal('cliente'))), createdAt: v.optional(v.number()) }).index('email', ['email']).index('phone', ['phone']),
    entries: defineTable({ ...entryFields, emailSteps: v.optional(emailSteps), revision: v.number(), seedKey: v.optional(v.string()) }),
    seeds: defineTable({ version: v.string() }).index('version', ['version']),
    newsletterSubscribers: defineTable({
        email: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
        status: v.union(v.literal('pending'), v.literal('subscribed'), v.literal('unsubscribed')),
        source: v.string(),
        klaviyoJobId: v.optional(v.string()),
        lastError: v.optional(v.string()),
    }).index('by_email', ['email']),
    kits: defineTable({ ...kitFields, revision: v.number(), updatedAt: v.number() }),
    kitProgress: defineTable({
        userId: v.id('users'), kitId: v.id('kits'),
        completed: v.array(v.string()), notes: v.string(),
        startedAt: v.number(), updatedAt: v.number(), finishedAt: v.optional(v.number()),
    }).index('by_user', ['userId']).index('by_user_kit', ['userId', 'kitId']).index('by_kit', ['kitId']),
    kitQuestions: defineTable({
        kitId: v.id('kits'), lessonId: v.string(), userId: v.id('users'), authorName: v.string(),
        body: v.string(), createdAt: v.number(),
        answer: v.optional(v.string()), answeredAt: v.optional(v.number()),
    }).index('by_kit', ['kitId', 'createdAt']).index('by_user', ['userId']),
    // To-do du jour : une tâche non terminée reste dans la liste les jours suivants.
    todos: defineTable({
        title: v.string(), day: v.string(), createdAt: v.number(),
        doneDay: v.optional(v.string()), doneAt: v.optional(v.number()),
        // Tâche proposée automatiquement : clé de l'élément d'origine, pour ne pas la proposer deux fois.
        source: v.optional(v.string()), dismissed: v.optional(v.boolean()),
    }).index('by_doneDay', ['doneDay']).index('by_source', ['source']),
});
