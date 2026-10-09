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

export function buildEmailButtonHtml(label: string, url: string) {
  if (!isSafeHttpUrl(url)) throw new Error('Le lien du bouton doit commencer par https:// ou http://.');
  const safeLabel = escapeHtml(label.trim() || 'En savoir plus');
  return `<p style="text-align:center;margin:28px 0;"><a href="${url.trim()}" style="display:inline-block;padding:14px 28px;background:#4553ae;color:#fffdf8;text-decoration:none;border-radius:3px;font-weight:normal;font-size:18px;letter-spacing:0.3px;font-family:'Edensor',Georgia,'Times New Roman',serif;">${safeLabel}</a></p>`;
}

export function normalizeEmailHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<p></p>') return '';
  return trimmed;
}
