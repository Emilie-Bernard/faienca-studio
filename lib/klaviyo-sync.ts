import type { KlaviyoSender } from './klaviyo-api';
import type { EmailStep } from './model';
import { EMAIL_TEXT_FONT, restyleEmailButtons } from './email-html';

export type FlowActionNode = {
  id?: string;
  temporary_id?: string;
  type: string;
  links?: { next?: string | null; next_if_true?: string | null; next_if_false?: string | null };
  data?: Record<string, unknown>;
};

export type FlowDefinition = {
  entry_action_id?: string;
  actions?: FlowActionNode[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
}

export function findFlowAction(definition: FlowDefinition, id: string | undefined) {
  if (!id) return undefined;
  return definition.actions?.find(action => action.id === id || action.temporary_id === id);
}

export function sendEmailActionDefinition(existing: FlowActionNode | undefined, actionId: string, message: { subject_line: string; template_id: string }) {
  const data = asObject(existing?.data);
  return {
    id: existing?.id ?? actionId,
    type: 'send-email',
    data: {
      ...data,
      message: { ...asObject(data.message), ...message },
    },
  };
}

export function timeDelayActionDefinition(existing: FlowActionNode | undefined, actionId: string, value: number) {
  return {
    id: existing?.id ?? actionId,
    type: 'time-delay',
    data: {
      ...asObject(existing?.data),
      unit: 'days',
      value,
    },
  };
}

/** Edensor (titres Faïença), servie par le studio. Gmail et Outlook Windows l’ignorent et passent à Georgia. */
export const EMAIL_FONT_FACE = "@font-face{font-family:'Edensor';src:url('https://faienca-studio.vercel.app/fonts/Edensor.otf') format('opentype');font-weight:normal;font-style:normal;}";

const EMAIL_LOGO_URL = 'https://faienca.fr/cdn/shop/files/Logo_textuel_bleu.png?width=360';
const EMAIL_HEADING_FONT = "'Edensor',Georgia,'Times New Roman',serif";

/**
 * Styles du contenu rédigé dans l’éditeur, alignés sur faienca.fr : texte en sans-serif (Myriad Pro sur le site),
 * titres Edensor bleus, images et boutons à angles droits.
 */
const EMAIL_CONTENT_CSS = [
  EMAIL_FONT_FACE,
  'body{margin:0;padding:0;background:#faf6f0;}',
  `.fa-content p{margin:0 0 18px;font-family:${EMAIL_TEXT_FONT};font-size:16px;line-height:1.7;color:#2c2825;}`,
  `.fa-content h2,.fa-content h3{margin:30px 0 12px;font-family:${EMAIL_HEADING_FONT};font-weight:normal;line-height:1.2;letter-spacing:-0.3px;}`,
  '.fa-content h2{font-size:34px;color:#4553ae;}.fa-content h3{font-size:24px;color:#2c2825;}',
  '.fa-content h2:first-child,.fa-content h3:first-child{margin-top:0;}',
  '.fa-content img{display:block;width:100%;max-width:100%;height:auto;margin:26px 0 !important;border-radius:0 !important;}',
  '.fa-content a{color:#4553ae;}',
  `.fa-content ul,.fa-content ol{margin:0 0 18px;padding-left:22px;color:#2c2825;font-family:${EMAIL_TEXT_FONT};font-size:16px;line-height:1.7;}`,
  '.fa-content blockquote{margin:24px 0;padding:4px 0 4px 18px;border-left:2px solid #c9a96e;color:#5f5f66;font-style:italic;}',
  '@media (max-width:620px){.fa-pad{padding-left:22px !important;padding-right:22px !important;}.fa-content h2{font-size:30px !important;}}',
].join('');

/**
 * Mise en page Faïença, dans l’esprit de faienca.fr : fond crème, carte blanche à angles droits, logo bleu,
 * sur-titre en capitales, texte sans-serif, pied de page avec la signature du site et la désinscription Klaviyo.
 */
export function wrapEmailHtml(body: string) {
  const content = body.trim();
  if (!content) return '<!DOCTYPE html><html><body></body></html>';
  if (/<html[\s>]/i.test(content)) return content;
  const styled = restyleEmailButtons(content);
  const small = `font-family:${EMAIL_TEXT_FONT};font-size:12px;line-height:1.8;color:#8a8279;`;
  const eyebrow = `font-family:${EMAIL_TEXT_FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#4553ae;`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><style>${EMAIL_CONTENT_CSS}</style></head>`
    + `<body style="margin:0;padding:0;background:#faf6f0;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf6f0;"><tr><td align="center" style="padding:32px 12px 24px;">`
    + `<table role="presentation" class="fa-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e9e2d8;">`
    + `<tr><td align="center" style="padding:34px 32px 10px;"><a href="https://faienca.fr" style="text-decoration:none;"><img src="${EMAIL_LOGO_URL}" alt="Faïença" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;"></a></td></tr>`
    + `<tr><td align="center" style="padding:0 32px 26px;${eyebrow}">Atelier Faïença · Barcelone</td></tr>`
    + `<tr><td style="padding:0 40px;" class="fa-pad"><div style="height:1px;line-height:1px;font-size:1px;background:#c9a96e;">&nbsp;</div></td></tr>`
    + `<tr><td class="fa-pad fa-content" style="padding:30px 40px 16px;font-family:${EMAIL_TEXT_FONT};font-size:16px;line-height:1.7;color:#2c2825;">${styled}</td></tr>`
    + `</table>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td align="center" style="padding:26px 24px 8px;">`
    + `<div style="${eyebrow}margin-bottom:6px;">Faïença Broderie</div>`
    + `<div style="${small}">Broderie traditionnelle inspirée du sud de la France<br>`
    + `<a href="https://faienca.fr" style="color:#4553ae;text-decoration:none;">faienca.fr</a> &nbsp;·&nbsp; <a href="https://instagram.com/faienca_broderie" style="color:#4553ae;text-decoration:none;">Instagram</a><br>`
    + `{{ organization.full_address }}<br>{% unsubscribe 'Se désinscrire' %}</div>`
    + `</td></tr></table>`
    + `</td></tr></table></body></html>`;
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

export function extractSyncedStepIds(definition: FlowDefinition) {
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
