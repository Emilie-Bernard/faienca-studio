export function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function isSafeHttpUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export type EmailButtonVariant = 'primary' | 'outline';

/** Police de texte des e-mails : Myriad Pro comme faienca.fr, puis les sans-serif disponibles partout. */
export const EMAIL_TEXT_FONT = "'Myriad Pro','Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Boutons comme sur faienca.fr : angles droits, capitales espacées, bleu Faïença.
 * `primary` est le bouton plein, `outline` le bouton à contour pour une action secondaire.
 */
export function emailButtonStyle(variant: EmailButtonVariant = 'primary') {
  const common = `display:inline-block;padding:15px 30px;text-decoration:none;border-radius:0;font-family:${EMAIL_TEXT_FONT};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;line-height:1.2;mso-padding-alt:0;`;
  return variant === 'outline'
    ? `${common}background:transparent;color:#4553ae;border:1px solid #4553ae;`
    : `${common}background:#4553ae;color:#ffffff;border:1px solid #4553ae;`;
}

export function buildEmailButtonHtml(label: string, url: string, variant: EmailButtonVariant = 'primary') {
  if (!isSafeHttpUrl(url)) throw new Error('Le lien du bouton doit commencer par https:// ou http://.');
  const safeLabel = escapeHtml(label.trim() || 'En savoir plus');
  return `<p style="text-align:center;margin:30px 0;"><a href="${url.trim()}" style="${emailButtonStyle(variant)}">${safeLabel}</a></p>`;
}

const BUTTON_ANCHOR = /<a\b([^>]*?)\sstyle="([^"]*display:\s*inline-block[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi;

/**
 * Ramène tous les boutons d’un e-mail (liens `display:inline-block`, même rédigés avec un ancien style)
 * au style courant, et retire le gras que l’éditeur ajoute dans les boutons.
 * Un bouton à contour (fond transparent ou bordure sans fond plein) reste un bouton à contour.
 */
export function restyleEmailButtons(html: string) {
  return html.replace(BUTTON_ANCHOR, (_m, before: string, style: string, after: string, inner: string) => {
    const outline = /background:\s*(transparent|none)/i.test(style) || (!/background(-color)?:/i.test(style) && /border:/i.test(style));
    const label = inner.replace(/^\s*<strong>([\s\S]*?)<\/strong>\s*$/i, '$1').trim();
    return `<a${before} style="${emailButtonStyle(outline ? 'outline' : 'primary')}"${after}>${label}</a>`;
  });
}

export function normalizeEmailHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<p></p>') return '';
  return trimmed;
}
