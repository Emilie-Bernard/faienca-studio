import { v, ConvexError } from 'convex/values';
import { action, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import { type GenericQueryCtx, type GenericDataModel, type GenericMutationCtx } from 'convex/server';
import { internal } from './_generated/api';
import { KlaviyoClient, klaviyoCampaignUrl, klaviyoFlowUrl } from '../lib/klaviyo-api';
import {
  buildFlowDefinition,
  campaignSendDatetime,
  extractSyncedStepIds,
  findFlowAction,
  scenarioStructureFingerprint,
  sendEmailActionDefinition,
  timeDelayActionDefinition,
  wrapEmailHtml,
  computeDelayDeltas,
  type FlowDefinition,
} from '../lib/klaviyo-sync';

import type { Id } from './_generated/dataModel';
import { requireAdmin } from './access';

type SyncEntry = {
  _id: Id<'entries'>;
  revision: number;
  kind: 'newsletter' | 'scenario';
  title: string;
  hook: string;
  text: string;
  date: string;
  klaviyoCampaignId?: string;
  klaviyoCampaignMessageId?: string;
  klaviyoTemplateId?: string;
  klaviyoFlowId?: string;
  klaviyoFlowStructure?: string;
  emailSteps: Array<{
    id: string;
    delayDays: number;
    subject: string;
    body: string;
    klaviyoTemplateId?: string;
    klaviyoFlowActionId?: string;
    klaviyoDelayActionId?: string;
  }>;
};

const owner = requireAdmin;

function klaviyoEnv() {
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  const listId = process.env.KLAVIYO_NEWSLETTER_LIST_ID;
  if (!apiKey || !listId) throw new ConvexError('Klaviyo non configuré. Ajoutez KLAVIYO_PRIVATE_API_KEY et KLAVIYO_NEWSLETTER_LIST_ID dans Convex.');
  return {
    client: new KlaviyoClient({ apiKey, revision: process.env.KLAVIYO_REVISION }),
    listId,
    sender: {
      fromEmail: process.env.KLAVIYO_FROM_EMAIL ?? 'contact@faienca.fr',
      fromLabel: process.env.KLAVIYO_FROM_LABEL ?? 'Faïença',
      replyToEmail: process.env.KLAVIYO_REPLY_TO_EMAIL,
    },
  };
}

const emailStepPatch = v.object({
  id: v.string(),
  klaviyoTemplateId: v.optional(v.string()),
  klaviyoFlowActionId: v.optional(v.string()),
  klaviyoDelayActionId: v.optional(v.string()),
});

const klaviyoPatch = v.object({
  klaviyoCampaignId: v.optional(v.string()),
  klaviyoCampaignMessageId: v.optional(v.string()),
  klaviyoTemplateId: v.optional(v.string()),
  klaviyoFlowId: v.optional(v.string()),
  klaviyoFlowStructure: v.optional(v.string()),
  emailSteps: v.optional(v.array(emailStepPatch)),
});

export const loadEntryForSync = internalQuery({
  args: {
    entryId: v.id('entries'),
    revision: v.number(),
    kind: v.union(v.literal('newsletter'), v.literal('scenario')),
  },
  returns: v.object({
    _id: v.id('entries'),
    revision: v.number(),
    kind: v.union(v.literal('newsletter'), v.literal('scenario')),
    title: v.string(),
    hook: v.string(),
    text: v.string(),
    date: v.string(),
    klaviyoCampaignId: v.optional(v.string()),
    klaviyoCampaignMessageId: v.optional(v.string()),
    klaviyoTemplateId: v.optional(v.string()),
    klaviyoFlowId: v.optional(v.string()),
    klaviyoFlowStructure: v.optional(v.string()),
    emailSteps: v.array(v.object({
      id: v.string(),
      delayDays: v.number(),
      subject: v.string(),
      body: v.string(),
      klaviyoTemplateId: v.optional(v.string()),
      klaviyoFlowActionId: v.optional(v.string()),
      klaviyoDelayActionId: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    await owner(ctx as unknown as GenericQueryCtx<GenericDataModel>);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new ConvexError('Fiche introuvable.');
    if (entry.revision !== args.revision) throw new ConvexError('La fiche a changé. Enregistrez puis réessayez.');
    if (entry.kind !== args.kind) throw new ConvexError('Type de fiche invalide.');
    return {
      _id: entry._id,
      revision: entry.revision,
      kind: entry.kind,
      title: entry.title,
      hook: entry.hook,
      text: entry.text,
      date: entry.date,
      klaviyoCampaignId: entry.klaviyoCampaignId,
      klaviyoCampaignMessageId: entry.klaviyoCampaignMessageId,
      klaviyoTemplateId: entry.klaviyoTemplateId,
      klaviyoFlowId: entry.klaviyoFlowId,
      klaviyoFlowStructure: entry.klaviyoFlowStructure,
      emailSteps: entry.emailSteps ?? [],
    };
  },
});

export const patchKlaviyoFields = internalMutation({
  args: {
    entryId: v.id('entries'),
    revision: v.number(),
    patch: klaviyoPatch,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await owner(ctx as unknown as GenericMutationCtx<GenericDataModel>);
    const before = await ctx.db.get(args.entryId);
    if (!before) throw new ConvexError('Fiche introuvable.');
    if (before.revision !== args.revision) throw new ConvexError('La fiche a changé pendant la synchronisation.');
    const nextRevision = before.revision + 1;
    const currentSteps = before.emailSteps ?? [];
    const emailSteps = args.patch.emailSteps
      ? currentSteps.map(step => {
        const patch = args.patch.emailSteps!.find(s => s.id === step.id);
        return patch ? { ...step, ...patch } : step;
      })
      : currentSteps;
    await ctx.db.patch(args.entryId, {
      klaviyoCampaignId: args.patch.klaviyoCampaignId ?? before.klaviyoCampaignId,
      klaviyoCampaignMessageId: args.patch.klaviyoCampaignMessageId ?? before.klaviyoCampaignMessageId,
      klaviyoTemplateId: args.patch.klaviyoTemplateId ?? before.klaviyoTemplateId,
      klaviyoFlowId: args.patch.klaviyoFlowId ?? before.klaviyoFlowId,
      klaviyoFlowStructure: args.patch.klaviyoFlowStructure ?? before.klaviyoFlowStructure,
      emailSteps,
      revision: nextRevision,
    });
    return nextRevision;
  },
});

export const archiveScenarioEntry = internalMutation({
  args: {
    entryId: v.id('entries'),
    revision: v.number(),
    clearKlaviyo: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await owner(ctx as unknown as GenericMutationCtx<GenericDataModel>);
    const before = await ctx.db.get(args.entryId);
    if (!before) throw new ConvexError('Fiche introuvable.');
    if (before.revision !== args.revision) throw new ConvexError('La fiche a changé. Rechargez-la.');
    if (before.kind !== 'scenario') throw new ConvexError('Seuls les scénarios s’archivent ainsi.');
    const nextRevision = before.revision + 1;
    await ctx.db.patch(args.entryId, {
      status: 'Archivé',
      revision: nextRevision,
      ...(args.clearKlaviyo ? {
        klaviyoFlowId: undefined,
        klaviyoFlowStructure: undefined,
        emailSteps: (before.emailSteps ?? []).map(step => ({ id: step.id, delayDays: step.delayDays, subject: step.subject, body: step.body })),
      } : {}),
    });
    return nextRevision;
  },
});

const syncResult = v.object({
  created: v.boolean(),
  url: v.string(),
  campaignId: v.optional(v.string()),
  templateId: v.optional(v.string()),
  flowId: v.optional(v.string()),
  stepCount: v.optional(v.number()),
  revision: v.number(),
});

async function loadEntry(ctx: ActionCtx, entryId: Id<'entries'>, revision: number, kind: 'newsletter' | 'scenario'): Promise<SyncEntry> {
  return await ctx.runQuery(internal.klaviyoSync.loadEntryForSync, { entryId, revision, kind });
}

export const syncNewsletter = action({
  args: { entryId: v.id('entries'), revision: v.number() },
  returns: syncResult,
  handler: async (ctx, args): Promise<{
    created: boolean;
    url: string;
    campaignId?: string;
    templateId?: string;
    flowId?: string;
    stepCount?: number;
    revision: number;
  }> => {
    const entry = await loadEntry(ctx, args.entryId, args.revision, 'newsletter');
    const { client, listId, sender } = klaviyoEnv();
    const html = wrapEmailHtml(entry.text);
    const templateName = `Studio · ${entry.title}`.slice(0, 200);
    let templateId = entry.klaviyoTemplateId;
    let created = false;

    if (templateId) {
      await client.updateTemplate(templateId, html, templateName);
    } else {
      templateId = await client.createTemplate(templateName, html);
      created = true;
    }

    let campaignId = entry.klaviyoCampaignId;
    let messageId = entry.klaviyoCampaignMessageId;
    if (!campaignId || !messageId) {
      const campaign = await client.createEmailCampaign(
        entry.title || 'Newsletter Faïença',
        listId,
        sender,
        entry.hook || entry.title || 'Newsletter Faïença',
        entry.hook || '',
        campaignSendDatetime(entry.date),
      );
      campaignId = campaign.campaignId;
      messageId = campaign.messageId;
      created = true;
    }

    await client.assignTemplateToCampaignMessage(messageId!, templateId);
    const revision: number = await ctx.runMutation(internal.klaviyoSync.patchKlaviyoFields, {
      entryId: args.entryId,
      revision: args.revision,
      patch: { klaviyoCampaignId: campaignId, klaviyoCampaignMessageId: messageId, klaviyoTemplateId: templateId },
    });

    return {
      created,
      url: klaviyoCampaignUrl(campaignId!),
      campaignId,
      templateId,
      revision,
    };
  },
});

export const syncScenario = action({
  args: { entryId: v.id('entries'), revision: v.number() },
  returns: syncResult,
  handler: async (ctx, args): Promise<{
    created: boolean;
    url: string;
    campaignId?: string;
    templateId?: string;
    flowId?: string;
    stepCount?: number;
    revision: number;
  }> => {
    const entry = await loadEntry(ctx, args.entryId, args.revision, 'scenario');
    if (entry.emailSteps.length < 1) throw new ConvexError('Ajoutez au moins un e-mail au scénario.');
    const { client, listId, sender } = klaviyoEnv();
    const fingerprint = scenarioStructureFingerprint(entry.emailSteps);
    const sameStructure = Boolean(entry.klaviyoFlowId && entry.klaviyoFlowStructure === fingerprint);
    let created = false;
    let flowId = entry.klaviyoFlowId;

    const steps = [...entry.emailSteps].sort((a, b) => a.delayDays - b.delayDays);
    const templateIds: string[] = [];
    const stepPatches: Array<{ id: string; klaviyoTemplateId?: string; klaviyoFlowActionId?: string; klaviyoDelayActionId?: string }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const html = wrapEmailHtml(step.body);
      const name = `Studio · ${entry.title} · E-mail ${i + 1}`.slice(0, 200);
      let templateId = step.klaviyoTemplateId;
      if (templateId && sameStructure) {
        await client.updateTemplate(templateId, html, name);
      } else {
        templateId = await client.createTemplate(name, html);
        created = true;
      }
      templateIds.push(templateId);
      stepPatches.push({ id: step.id, klaviyoTemplateId: templateId });
    }

    if (sameStructure && flowId) {
      const definition = await client.getFlowDefinition(flowId) as FlowDefinition;
      const { sendEmailIds, delayIds } = extractSyncedStepIds(definition);
      const deltas = computeDelayDeltas(steps);
      for (let i = 0; i < steps.length; i++) {
        const emailActionId = sendEmailIds[i] ?? steps[i]!.klaviyoFlowActionId;
        const delayActionId = delayIds[i] ?? steps[i]!.klaviyoDelayActionId;
        if (emailActionId) {
          await client.updateFlowAction(emailActionId, sendEmailActionDefinition(findFlowAction(definition, emailActionId), emailActionId, {
            subject_line: steps[i]!.subject || `E-mail ${i + 1}`,
            template_id: templateIds[i]!,
          }));
        }
        if (i > 0 && delayActionId && deltas[i]! > 0) {
          await client.updateFlowAction(delayActionId, timeDelayActionDefinition(findFlowAction(definition, delayActionId), delayActionId, deltas[i]!));
        }
        stepPatches[i] = {
          ...stepPatches[i]!,
          klaviyoFlowActionId: emailActionId,
          klaviyoDelayActionId: i > 0 ? delayActionId : undefined,
        };
      }
    } else {
      const definition = buildFlowDefinition(steps, templateIds, listId, sender);
      const result = await client.createFlow(`Studio · ${entry.title}`.slice(0, 200), definition);
      flowId = result.flowId;
      created = true;
      const savedDefinition = (result.definition ?? await client.getFlowDefinition(flowId)) as FlowDefinition;
      const { sendEmailIds, delayIds } = extractSyncedStepIds(savedDefinition);
      for (let i = 0; i < steps.length; i++) {
        stepPatches[i] = {
          ...stepPatches[i]!,
          klaviyoFlowActionId: sendEmailIds[i],
          klaviyoDelayActionId: i > 0 ? delayIds[i] : undefined,
        };
      }
    }

    const revision: number = await ctx.runMutation(internal.klaviyoSync.patchKlaviyoFields, {
      entryId: args.entryId,
      revision: args.revision,
      patch: {
        klaviyoFlowId: flowId,
        klaviyoFlowStructure: fingerprint,
        emailSteps: stepPatches,
      },
    });

    return {
      created,
      url: klaviyoFlowUrl(flowId!),
      flowId,
      stepCount: steps.length,
      revision,
    };
  },
});

export const archiveScenario = action({
  args: {
    entryId: v.id('entries'),
    revision: v.number(),
    deleteFromKlaviyo: v.boolean(),
  },
  returns: v.object({
    revision: v.number(),
    klaviyoDeleted: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ revision: number; klaviyoDeleted: boolean }> => {
    const entry = await loadEntry(ctx, args.entryId, args.revision, 'scenario');
    let klaviyoDeleted = false;
    if (args.deleteFromKlaviyo && entry.klaviyoFlowId) {
      const { client } = klaviyoEnv();
      await client.deleteFlow(entry.klaviyoFlowId);
      klaviyoDeleted = true;
    }
    const revision = await ctx.runMutation(internal.klaviyoSync.archiveScenarioEntry, {
      entryId: args.entryId,
      revision: args.revision,
      clearKlaviyo: klaviyoDeleted,
    });
    return { revision, klaviyoDeleted };
  },
});
