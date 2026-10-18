import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
const emailSteps = v.array(v.object({
    id: v.string(), delayDays: v.number(), subject: v.string(), body: v.string(),
    klaviyoTemplateId: v.optional(v.string()),
    klaviyoFlowActionId: v.optional(v.string()),
    klaviyoDelayActionId: v.optional(v.string()),
}));
export const missionFile = v.object({ id: v.string(), label: v.string(), url: v.string(), storageId: v.optional(v.id('_storage')) });
export const missionStatus = v.union(v.literal('todo'), v.literal('doing'), v.literal('submitted'), v.literal('validated'));
export const projectStatus = v.union(v.literal('idea'), v.literal('doing'), v.literal('paused'), v.literal('done'));
/** Traductions anglaise et espagnole ; un champ vide reprend le français. */
const translated = <T extends Record<string, ReturnType<typeof v.string>>>(fields: T) => v.optional(v.object({ en: v.optional(v.object(fields)), es: v.optional(v.object(fields)) }));
export const lessonTranslations = translated({ title: v.string(), stitch: v.string(), notes: v.string() });
export const kitTranslations = translated({ title: v.string(), description: v.string() });
export const lessonFields = v.object({
    id: v.string(), title: v.string(), stitch: v.string(), videoUrl: v.string(),
    videoStorageId: v.optional(v.id('_storage')), notes: v.string(),
    translations: lessonTranslations,
});
export const kitFields = {
    title: v.string(), description: v.string(), coverUrl: v.string(), accessCode: v.string(),
    published: v.boolean(), lessons: v.array(lessonFields),
    translations: kitTranslations,
    // Kit non publié mais annoncé : visible « À venir », les clientes peuvent déjà saisir leur code.
    upcoming: v.optional(v.boolean()),
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
    users: defineTable({ name: v.optional(v.string()), email: v.optional(v.string()), image: v.optional(v.string()), emailVerificationTime: v.optional(v.number()), phone: v.optional(v.string()), phoneVerificationTime: v.optional(v.number()), isAnonymous: v.optional(v.boolean()), githubId: v.optional(v.string()), role: v.optional(v.union(v.literal('admin'), v.literal('cliente'), v.literal('stagiaire'))), createdAt: v.optional(v.number()),
        // Suivi des connexions : dernière visite, nombre de visites et langue de l'interface (pour les e-mails).
        lastSeenAt: v.optional(v.number()), visits: v.optional(v.number()), locale: v.optional(v.string()) }).index('email', ['email']).index('phone', ['phone']),
    entries: defineTable({ ...entryFields, emailSteps: v.optional(emailSteps), revision: v.number(), seedKey: v.optional(v.string()), media: v.optional(v.array(missionFile)) }),
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
        // Code saisi par la cliente ou kit offert depuis l'atelier.
        source: v.optional(v.union(v.literal('code'), v.literal('admin'))),
        // Kit ajouté pendant qu'il était « À venir » : un e-mail part à sa publication.
        awaitingRelease: v.optional(v.boolean()), notifiedAt: v.optional(v.number()),
    }).index('by_user', ['userId']).index('by_user_kit', ['userId', 'kitId']).index('by_kit', ['kitId']),
    // Demande d'activation sans code : l'administratrice l'accepte (le kit entre dans le carnet, e-mail à la cliente) ou la refuse.
    kitRequests: defineTable({
        userId: v.id('users'), kitId: v.id('kits'), message: v.string(),
        status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('refused')),
        createdAt: v.number(), decidedAt: v.optional(v.number()),
    }).index('by_user_kit', ['userId', 'kitId']).index('by_status', ['status', 'createdAt']).index('by_kit', ['kitId']),
    kitQuestions: defineTable({
        kitId: v.id('kits'), lessonId: v.string(), userId: v.id('users'), authorName: v.string(),
        body: v.string(), createdAt: v.number(),
        answer: v.optional(v.string()), answeredAt: v.optional(v.number()),
    }).index('by_kit', ['kitId', 'createdAt']).index('by_user', ['userId']),
    // Stage : missions préparées par l'atelier, suivies à son rythme par la stagiaire.
    missions: defineTable({
        title: v.string(), description: v.string(), phase: v.string(), dueDate: v.string(), published: v.boolean(),
        resources: v.array(missionFile), order: v.number(), revision: v.number(), updatedAt: v.number(),
    }),
    missionProgress: defineTable({
        userId: v.id('users'), missionId: v.id('missions'), status: missionStatus,
        notes: v.string(), deliverables: v.array(missionFile), feedback: v.string(), updatedAt: v.number(),
    }).index('by_user', ['userId']).index('by_mission', ['missionId']).index('by_user_mission', ['userId', 'missionId']),
    // Projets proposés par la stagiaire elle-même : une idée, des documents, des questions pour l'atelier.
    traineeProjects: defineTable({
        authorId: v.id('users'), title: v.string(), description: v.string(), status: projectStatus,
        files: v.array(missionFile), createdAt: v.number(), updatedAt: v.number(),
        // Dernière consultation par l'atelier : signale les nouveautés dans la liste.
        seenByAdminAt: v.optional(v.number()),
    }).index('by_author', ['authorId']),
    projectQuestions: defineTable({
        projectId: v.id('traineeProjects'), authorId: v.id('users'), body: v.string(), createdAt: v.number(),
        answer: v.optional(v.string()), answeredAt: v.optional(v.number()),
    }).index('by_project', ['projectId', 'createdAt']),
    // Bibliothèque partagée entre l'atelier et les stagiaires.
    libraryItems: defineTable({
        title: v.string(), category: v.string(), description: v.string(), file: missionFile,
        authorId: v.id('users'), authorName: v.string(), createdAt: v.number(),
    }),
    // Produits de la boutique : kits et modèles PDF, avec contenu, matériaux, fichiers et checklist de lancement.
    products: defineTable({
        type: v.union(v.literal('kit'), v.literal('pdf')), title: v.string(), description: v.string(), status: v.string(),
        price: v.union(v.number(), v.null()), shopUrl: v.string(), coverUrl: v.string(), linkedKitId: v.string(),
        contents: v.array(v.object({ id: v.string(), name: v.string(), notes: v.string() })),
        materials: v.array(v.object({
            id: v.string(), name: v.string(), quantity: v.string(), purpose: v.union(v.literal('kit'), v.literal('atelier')),
            unitCost: v.union(v.number(), v.null()), bought: v.boolean(), notes: v.string(),
            links: v.array(v.object({ id: v.string(), shop: v.string(), url: v.string(), note: v.string() })),
        })),
        pdfs: v.object({ fr: v.optional(missionFile), en: v.optional(missionFile), es: v.optional(missionFile) }),
        tasks: v.array(v.object({ id: v.string(), title: v.string(), done: v.boolean() })),
        revision: v.number(), updatedAt: v.number(),
    }),
    // To-do du jour : une tâche non terminée reste dans la liste les jours suivants.
    todos: defineTable({
        title: v.string(), day: v.string(), createdAt: v.number(),
        doneDay: v.optional(v.string()), doneAt: v.optional(v.number()),
        // Tâche proposée automatiquement : clé de l'élément d'origine, pour ne pas la proposer deux fois.
        source: v.optional(v.string()), dismissed: v.optional(v.boolean()),
    }).index('by_doneDay', ['doneDay']).index('by_source', ['source']),
    // Dépenses de l'atelier : une facture ou un achat, montant TTC en euros, justificatif facultatif.
    expenses: defineTable({
        date: v.string(), supplier: v.string(), label: v.string(), category: v.string(), amount: v.number(), notes: v.string(),
        receipt: v.optional(missionFile), createdAt: v.number(), updatedAt: v.number(),
    }).index('by_date', ['date']),
});
