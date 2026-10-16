import { EMAIL_TEXT_FONT, emailButtonStyle, escapeHtml, isSafeHttpUrl } from './email-html';

export type ReleaseLocale = 'fr' | 'en' | 'es';
export type ReleaseEmailInput = { locale?: string; firstName: string; kitTitle: string; coverUrl: string; kitUrl: string; logoUrl: string };

const COPY: Record<ReleaseLocale, {
  subject: (kit: string) => string; eyebrow: string; hello: (name: string) => string; title: (kit: string) => string;
  body: string; cta: string; after: string; signature: string; tagline: string; fallback: string; why: string;
}> = {
  fr: {
    subject: kit => `Votre kit « ${kit} » est disponible`,
    eyebrow: 'Nouveau dans votre carnet', hello: name => name ? `Bonjour ${name},` : 'Bonjour,',
    title: kit => `« ${kit} » est arrivé`,
    body: 'Le kit que vous attendiez est publié. Les leçons vidéo sont prêtes dans votre carnet Faïença : installez-vous, préparez vos fils, on commence quand vous voulez.',
    cta: 'Ouvrir mon kit', after: 'Votre progression et vos notes restent enregistrées d’une séance à l’autre. Une question sur un point ? Posez-la sous la leçon, je vous réponds.',
    signature: 'Belle broderie,<br>Émilie · Faïença', tagline: 'Le Sud dans les idées. Le fil entre les mains.',
    fallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    why: 'Vous recevez cet e-mail car ce kit était réservé dans votre carnet avant sa sortie.',
  },
  en: {
    subject: kit => `Your “${kit}” kit is now available`,
    eyebrow: 'New in your notebook', hello: name => name ? `Hello ${name},` : 'Hello,',
    title: kit => `“${kit}” has arrived`,
    body: 'The kit you were waiting for is out. The video lessons are ready in your Faïença notebook: settle in, get your threads ready, and start whenever you like.',
    cta: 'Open my kit', after: 'Your progress and notes are saved from one session to the next. A question about a stitch? Ask it under the lesson and I will answer.',
    signature: 'Happy stitching,<br>Émilie · Faïença', tagline: 'The South in our ideas. The thread in your hands.',
    fallback: 'Button not working? Copy this link into your browser:',
    why: 'You are receiving this email because this kit was reserved in your notebook before its release.',
  },
  es: {
    subject: kit => `Tu kit «${kit}» ya está disponible`,
    eyebrow: 'Novedad en tu cuaderno', hello: name => name ? `Hola ${name}:` : 'Hola:',
    title: kit => `«${kit}» ya está aquí`,
    body: 'El kit que esperabas ya está publicado. Las lecciones en vídeo te esperan en tu cuaderno Faïença: ponte cómoda, prepara tus hilos y empieza cuando quieras.',
    cta: 'Abrir mi kit', after: 'Tu progreso y tus notas se guardan de una sesión a otra. ¿Una duda sobre un punto? Pregúntala debajo de la lección y te respondo.',
    signature: 'Feliz bordado,<br>Émilie · Faïença', tagline: 'El Sur en las ideas. El hilo entre las manos.',
    fallback: '¿El botón no funciona? Copia este enlace en tu navegador:',
    why: 'Recibes este correo porque este kit estaba reservado en tu cuaderno antes de su lanzamiento.',
  },
};

export const releaseLocale = (locale?: string): ReleaseLocale => locale === 'en' || locale === 'es' ? locale : 'fr';

/** E-mail « votre kit est disponible » aux couleurs Faïença (styles en ligne pour les messageries). */
export function releaseEmail({ locale, firstName, kitTitle, coverUrl, kitUrl, logoUrl }: ReleaseEmailInput) {
  const lang = releaseLocale(locale), c = COPY[lang];
  if (!isSafeHttpUrl(kitUrl)) throw new Error('Le lien du kit doit commencer par https:// ou http://.');
  const name = escapeHtml(firstName.trim()), kit = escapeHtml(kitTitle.trim()), url = escapeHtml(kitUrl);
  const subject = c.subject(kitTitle.trim());
  const text = `${c.hello(firstName.trim())}\n\n${c.body}\n\n${c.cta} : ${kitUrl}\n\n${c.after}\n\n${c.signature.replace('<br>', '\n')}\n\n${c.why}`;
  const cover = /^https:\/\//i.test(coverUrl)
    ? `<tr><td style="padding:28px 32px 0;text-align:center;"><img src="${escapeHtml(coverUrl)}" width="200" alt="" style="display:inline-block;width:200px;max-width:100%;height:auto;border:0;"></td></tr>`
    : '';
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:32px 16px;background:#faf6f0;font-family:${EMAIL_TEXT_FONT};color:#2c2825;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(c.body)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
<tr><td style="padding:0 0 22px;text-align:center;"><img src="${escapeHtml(logoUrl)}" width="200" alt="Faïença" style="display:inline-block;width:200px;height:auto;border:0;"></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e4dcd1;">
<tr><td style="height:8px;background:#4553ae;font-size:0;line-height:0;">&nbsp;</td></tr>
${cover}
<tr><td style="padding:32px 32px 8px;">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#b03f25;font-weight:600;">${c.eyebrow}</p>
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.25;color:#2c2825;">${c.title(kit)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.7;">${c.hello(name)}</p>
<p style="margin:0 0 6px;font-size:15px;line-height:1.7;">${escapeHtml(c.body)}</p>
<p style="text-align:center;margin:30px 0;"><a href="${url}" style="${emailButtonStyle('primary')}">${c.cta}</a></p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.7;">${escapeHtml(c.after)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;">${c.signature}</p>
<p style="margin:0 0 8px;padding-top:16px;border-top:1px solid #e4dcd1;font-size:12px;line-height:1.6;color:#6b625a;">${c.fallback}<br><a href="${url}" style="color:#4553ae;word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td style="padding:12px 32px 28px;font-size:12px;line-height:1.6;color:#6b625a;">${c.why}<br>Faïença · ${c.tagline}</td></tr>
</table></body></html>`;
  return { subject, text, html };
}
