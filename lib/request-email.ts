import { EMAIL_TEXT_FONT, emailButtonStyle, escapeHtml, isSafeHttpUrl } from './email-html';
import { releaseLocale } from './release-email';

/** Gabarit des e-mails Faïença : logo, carte crème, filet bleu, styles en ligne pour les messageries. */
function layout({ lang, subject, preheader, logoUrl, coverUrl, body, footer }: { lang: string; subject: string; preheader: string; logoUrl: string; coverUrl?: string; body: string; footer: string }) {
  const cover = coverUrl && /^https:\/\//i.test(coverUrl)
    ? `<tr><td style="padding:28px 32px 0;text-align:center;"><img src="${escapeHtml(coverUrl)}" width="200" alt="" style="display:inline-block;width:200px;max-width:100%;height:auto;border:0;"></td></tr>`
    : '';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:32px 16px;background:#faf6f0;font-family:${EMAIL_TEXT_FONT};color:#2c2825;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
<tr><td style="padding:0 0 22px;text-align:center;"><img src="${escapeHtml(logoUrl)}" width="200" alt="Faïença" style="display:inline-block;width:200px;height:auto;border:0;"></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e4dcd1;">
<tr><td style="height:8px;background:#4553ae;font-size:0;line-height:0;">&nbsp;</td></tr>
${cover}
<tr><td style="padding:32px 32px 8px;">${body}</td></tr>
<tr><td style="padding:12px 32px 28px;font-size:12px;line-height:1.6;color:#6b625a;">${footer}</td></tr>
</table></body></html>`;
}

const P = 'margin:0 0 14px;font-size:15px;line-height:1.7;';
const eyebrow = (s: string) => `<p style="margin:0 0 8px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#b03f25;font-weight:600;">${s}</p>`;
const h1 = (s: string) => `<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.25;color:#2c2825;">${s}</h1>`;
const button = (url: string, label: string) => `<p style="text-align:center;margin:30px 0;"><a href="${url}" style="${emailButtonStyle('primary')}">${label}</a></p>`;
const fallback = (label: string, url: string) => `<p style="margin:0 0 8px;padding-top:16px;border-top:1px solid #e4dcd1;font-size:12px;line-height:1.6;color:#6b625a;">${label}<br><a href="${url}" style="color:#4553ae;word-break:break-all;">${url}</a></p>`;

export type PendingRequest = { name: string; email: string; kitTitle: string; message: string; createdAt: number };

/** E-mail à l'administratrice : la nouvelle demande, puis toutes celles qui attendent sa réponse. */
export function adminRequestsEmail({ latest, pending, studioUrl, logoUrl }: { latest: PendingRequest; pending: PendingRequest[]; studioUrl: string; logoUrl: string }) {
  if (!isSafeHttpUrl(studioUrl)) throw new Error('Le lien de l’atelier doit commencer par https:// ou http://.');
  const url = escapeHtml(studioUrl), who = latest.name.trim() || latest.email;
  const subject = `Demande d’activation : ${latest.kitTitle} (${who})`;
  const n = pending.length;
  const date = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  const rows = pending.map(r => `<tr><td style="padding:12px 0;border-top:1px solid #e4dcd1;font-size:14px;line-height:1.55;">
<strong>${escapeHtml(r.name.trim() || r.email)}</strong> <span style="color:#6b625a;">· ${escapeHtml(r.email)} · ${date(r.createdAt)}</span><br>
<span style="color:#4553ae;">${escapeHtml(r.kitTitle)}</span>${r.message.trim() ? `<br><em style="color:#6b625a;">« ${escapeHtml(r.message.trim())} »</em>` : ''}</td></tr>`).join('');
  const body = `${eyebrow('Espace brodeuses')}${h1('Nouvelle demande d’activation')}
<p style="${P}"><strong>${escapeHtml(who)}</strong> (${escapeHtml(latest.email)}) demande l’accès au kit <strong>${escapeHtml(latest.kitTitle)}</strong>.</p>
${latest.message.trim() ? `<p style="${P}padding:12px 16px;background:#faf6f0;border-left:3px solid #f9ad4f;">${escapeHtml(latest.message.trim())}</p>` : ''}
${button(url, 'Répondre aux demandes')}
<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#2c2825;">${n} demande${n > 1 ? 's' : ''} en attente</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${rows}</table>
${fallback('Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :', url)}`;
  const text = `${who} (${latest.email}) demande l’accès au kit « ${latest.kitTitle} ».${latest.message.trim() ? `\n\n« ${latest.message.trim()} »` : ''}\n\n${n} demande${n > 1 ? 's' : ''} en attente :\n${pending.map(r => `- ${r.name.trim() || r.email} (${r.email}) : ${r.kitTitle}`).join('\n')}\n\nRépondre aux demandes : ${studioUrl}`;
  const html = layout({ lang: 'fr', subject, preheader: `${who} demande l’accès à ${latest.kitTitle}.`, logoUrl, body, footer: 'Acceptez la demande dans l’atelier : le kit entre dans son carnet et elle reçoit un e-mail.<br>Faïença Studio' });
  return { subject, text, html };
}

const ACCEPTED = {
  fr: {
    subject: (kit: string) => `Votre kit « ${kit} » est activé`, eyebrow: 'Demande acceptée', hello: (name: string) => name ? `Bonjour ${name},` : 'Bonjour,',
    title: (kit: string) => `« ${kit} » vous attend`,
    body: 'Bonne nouvelle : votre demande d’activation est acceptée. Le kit est maintenant dans votre carnet Faïença, avec ses leçons vidéo point par point.',
    upcoming: 'Le kit est réservé dans votre carnet. Ses leçons ne sont pas encore en ligne : vous recevrez un e-mail dès sa sortie.',
    cta: 'Ouvrir mon carnet', signature: 'Belle broderie,<br>Émilie · Faïença', tagline: 'Le Sud dans les idées. Le fil entre les mains.',
    fallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :', why: 'Vous recevez cet e-mail car vous avez demandé l’activation de ce kit.',
  },
  en: {
    subject: (kit: string) => `Your “${kit}” kit is activated`, eyebrow: 'Request accepted', hello: (name: string) => name ? `Hello ${name},` : 'Hello,',
    title: (kit: string) => `“${kit}” is waiting for you`,
    body: 'Good news: your activation request has been accepted. The kit is now in your Faïença notebook, with its stitch-by-stitch video lessons.',
    upcoming: 'The kit is reserved in your notebook. Its lessons are not online yet: you will get an email as soon as it is released.',
    cta: 'Open my notebook', signature: 'Happy stitching,<br>Émilie · Faïença', tagline: 'The South in our ideas. The thread in your hands.',
    fallback: 'Button not working? Copy this link into your browser:', why: 'You are receiving this email because you asked for this kit to be activated.',
  },
  es: {
    subject: (kit: string) => `Tu kit «${kit}» está activado`, eyebrow: 'Solicitud aceptada', hello: (name: string) => name ? `Hola ${name}:` : 'Hola:',
    title: (kit: string) => `«${kit}» te espera`,
    body: 'Buenas noticias: tu solicitud de activación ha sido aceptada. El kit ya está en tu cuaderno Faïença, con sus lecciones en vídeo punto por punto.',
    upcoming: 'El kit está reservado en tu cuaderno. Sus lecciones aún no están en línea: recibirás un correo en cuanto salga.',
    cta: 'Abrir mi cuaderno', signature: 'Feliz bordado,<br>Émilie · Faïença', tagline: 'El Sur en las ideas. El hilo entre las manos.',
    fallback: '¿El botón no funciona? Copia este enlace en tu navegador:', why: 'Recibes este correo porque pediste la activación de este kit.',
  },
};

/** E-mail à la cliente quand l'administratrice accepte sa demande. */
export function requestAcceptedEmail({ locale, firstName, kitTitle, coverUrl, kitUrl, logoUrl, upcoming }: { locale?: string; firstName: string; kitTitle: string; coverUrl: string; kitUrl: string; logoUrl: string; upcoming: boolean }) {
  const lang = releaseLocale(locale), c = ACCEPTED[lang];
  if (!isSafeHttpUrl(kitUrl)) throw new Error('Le lien du kit doit commencer par https:// ou http://.');
  const name = escapeHtml(firstName.trim()), kit = escapeHtml(kitTitle.trim()), url = escapeHtml(kitUrl);
  const subject = c.subject(kitTitle.trim()), lead = upcoming ? c.upcoming : c.body;
  const body = `${eyebrow(c.eyebrow)}${h1(c.title(kit))}<p style="${P}">${c.hello(name)}</p><p style="margin:0 0 6px;font-size:15px;line-height:1.7;">${escapeHtml(lead)}</p>${button(url, c.cta)}<p style="margin:0 0 24px;font-size:15px;line-height:1.7;">${c.signature}</p>${fallback(c.fallback, url)}`;
  const text = `${c.hello(firstName.trim())}\n\n${lead}\n\n${c.cta} : ${kitUrl}\n\n${c.signature.replace('<br>', '\n')}\n\n${c.why}`;
  const html = layout({ lang, subject, preheader: lead, logoUrl, coverUrl, body, footer: `${c.why}<br>Faïença · ${c.tagline}` });
  return { subject, text, html };
}
