import { escapeHtml } from './email-html';

/**
 * Description de kit mise en forme dans l'atelier (éditeur TipTap).
 * Les anciennes descriptions en texte brut restent valables : elles s'affichent paragraphe par paragraphe.
 */

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a']);
const SAFE_HREF = /^(https?:|mailto:)/i;

export const isRichText = (s: string) => /^\s*<(p|h2|h3|ul|ol|blockquote)[\s>]/i.test(s);

/** Texte brut (sauts de ligne) en HTML de paragraphes, pour l'éditeur et l'affichage. */
export function plainToHtml(text: string) {
  return text.trim().split(/\n{2,}/).filter(Boolean).map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Ne garde que les balises de mise en forme, sans attribut sauf un lien http(s) ou mailto. */
export function sanitizeRichText(html: string) {
  if (!isRichText(html)) return plainToHtml(html);
  return html
    .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (tag, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED.has(name)) return '';
      if (tag.startsWith('</')) return name === 'br' ? '' : `</${name}>`;
      if (name !== 'a') return `<${name}>`;
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = (href?.[2] ?? href?.[3] ?? '').trim();
      return SAFE_HREF.test(url) ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">` : '<a>';
    });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Texte sans balises : aperçu des cartes, recherche, e-mails. */
export function richTextToPlain(s: string) {
  if (!isRichText(s)) return s.trim();
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** L'éditeur vide renvoie « <p></p> » : on enregistre une description vide. */
export const normalizeRichText = (html: string) => richTextToPlain(html) ? html : '';
