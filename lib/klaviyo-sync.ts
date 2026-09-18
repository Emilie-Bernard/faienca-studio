import type { KlaviyoSender } from './klaviyo-api';
import type { EmailStep } from './model';

export type FlowActionNode = {
  id?: string;
  temporary_id?: string;
  type: string;
  links?: { next?: string | null; next_if_true?: string | null; next_if_false?: string | null };
  data?: Record<string, unknown>;
};

export function wrapEmailHtml(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return '<!DOCTYPE html><html><body></body></html>';
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#154757;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">${trimmed}</body></html>`;
}

export function scenarioStructureFingerprint(steps: Pick<EmailStep, 'delayDays'>[]) {
  return `${steps.length}:${steps.map(s => s.delayDays).join(',')}`;
}

export function computeDelayDeltas(steps: Pick<EmailStep, 'delayDays'>[]) {
  if (steps.length < 1) throw new Error('Un scénario doit contenir au moins un e-mail.');
  const deltas: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const prev = i === 0 ? 0 : steps[i - 1]!.delayDays;
    const delta = steps[i]!.delayDays - prev;
    if (delta < 0) throw new Error('Les délais doivent être croissants (J+0, J+2, J+7…).');
    deltas.push(delta);
  }
  return deltas;
}

export function buildFlowDefinition(
  steps: EmailStep[],
  templateIds: string[],
  listId: string,
  sender: KlaviyoSender,
) {
  if (templateIds.length !== steps.length) throw new Error('Nombre de templates incohérent.');
  const chain = buildFlowActionChain(steps, templateIds, sender);
  return {
    triggers: [{ type: 'list', id: listId }],
    actions: chain.actions,
    entry_action_id: chain.entryActionId,
  };
}

function buildFlowActionChain(
  steps: EmailStep[],
  templateIds: string[],
  sender: KlaviyoSender,
) {
  const deltas = computeDelayDeltas(steps);
  const actions: FlowActionNode[] = [];
  let counter = 0;
  const nextId = () => `action-${counter++}`;

  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && deltas[i]! > 0) {
      actions.push({
        temporary_id: nextId(),
        type: 'time-delay',
        links: { next: null },
        data: { unit: 'days', value: deltas[i]!, secondary_value: 0, timezone: 'profile' },
      });
    }
    const step = steps[i]!;
    actions.push({
      temporary_id: nextId(),
      type: 'send-email',
      links: { next: null },
      data: {
        status: 'draft',
        message: {
          from_email: sender.fromEmail,
          from_label: sender.fromLabel,
          reply_to_email: sender.replyToEmail ?? sender.fromEmail,
          subject_line: step.subject || `E-mail ${i + 1}`,
          preview_text: '',
          template_id: templateIds[i]!,
          smart_sending_enabled: true,
          transactional: false,
          add_tracking_params: false,
        },
      },
    });
  }

  for (let i = 0; i < actions.length - 1; i++) {
    const next = actions[i + 1]!.temporary_id ?? actions[i + 1]!.id ?? null;
    actions[i]!.links = { next };
  }
  const entryActionId = actions[0]!.temporary_id ?? actions[0]!.id;
  if (!entryActionId) throw new Error('Impossible de construire le flow.');
  return { actions, entryActionId };
}

export function extractSyncedStepIds(definition: { entry_action_id?: string; actions?: FlowActionNode[] }) {
  const actions = definition.actions ?? [];
  const byKey = new Map<string, FlowActionNode>();
  for (const action of actions) {
    if (action.id) byKey.set(action.id, action);
    if (action.temporary_id) byKey.set(action.temporary_id, action);
  }
  let currentId = definition.entry_action_id;
  const sendEmailIds: string[] = [];
  const delayIds: (string | undefined)[] = [];
  let pendingDelay: string | undefined;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const action = byKey.get(currentId);
    if (!action) break;
    if (action.type === 'time-delay') pendingDelay = action.id ?? action.temporary_id;
    if (action.type === 'send-email') {
      sendEmailIds.push(action.id ?? action.temporary_id ?? '');
      delayIds.push(pendingDelay);
      pendingDelay = undefined;
    }
    currentId = action.links?.next ?? undefined;
  }
  return { sendEmailIds, delayIds };
}

export function campaignSendDatetime(date: string | undefined) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T09:00:00+01:00`;
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.toISOString().slice(0, 10)}T09:00:00+00:00`;
}
