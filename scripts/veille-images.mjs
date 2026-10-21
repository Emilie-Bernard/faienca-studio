// Va chercher sur le site de chaque concurrente l'image à montrer sur sa carte, et l'écrit dans sa fiche (photoUrl).
//   node scripts/veille-images.mjs              → les fiches sans image (data/veille/concurrentes/*.json)
//   node scripts/veille-images.mjs --remplacer  → toutes les fiches, même celles qui ont déjà une image
// On prend l'image de partage du site (og:image), sinon sa grande icône (apple-touch-icon), sinon son favicon.
// Ensuite : node scripts/veille-import.mjs --concurrentes [--prod]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'data/veille/concurrentes';
const replace = process.argv.includes('--remplacer');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '';
const decode = s => s.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&');

/** Les balises <meta> et <link> de la page, dans l'ordre où le site les donne. */
function candidates(html, base) {
    const tags = html.match(/<(meta|link)\b[^>]*>/gi) ?? [];
    const abs = u => { try { const url = new URL(decode(u), base); url.protocol = 'https:'; return url.href; } catch { return ''; } };
    const metas = tags.filter(t => /^<meta/i.test(t));
    const links = tags.filter(t => /^<link/i.test(t));
    const og = metas.filter(t => /(property|name)\s*=\s*["'](og:image(:secure_url)?|twitter:image)["']/i.test(t)).map(t => attr(t, 'content'));
    const rel = r => links.filter(t => new RegExp(`rel\\s*=\\s*["'][^"']*${r}[^"']*["']`, 'i').test(t)).map(t => attr(t, 'href'));
    // Parmi les icônes, la plus grande d'abord (sizes="192x192" avant sizes="32x32").
    const size = t => Number(attr(t, 'sizes').split('x')[0]) || 0;
    const icons = links.filter(t => /rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(t) && !/apple/i.test(t)).sort((a, b) => size(b) - size(a)).map(t => attr(t, 'href'));
    return [...og, ...rel('apple-touch-icon'), ...icons, '/favicon.ico'].map(abs).filter(Boolean);
}

async function reachable(url) {
    try {
        const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (Faienca studio)' } });
        return r.ok && /^image\//.test(r.headers.get('content-type') ?? '');
    } catch { return false; }
}

for (const name of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const file = join(dir, name), fiche = JSON.parse(readFileSync(file, 'utf8'));
    if (fiche.photoUrl && !replace) { console.log(`· ${fiche.name} : a déjà une image`); continue; }
    if (!fiche.website) { console.log(`· ${fiche.name} : pas de site`); continue; }
    try {
        const r = await fetch(fiche.website, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 (Faienca studio)' } });
        const html = await r.text();
        let found = '';
        for (const url of candidates(html, r.url)) if (await reachable(url)) { found = url; break; }
        if (!found) { console.log(`✗ ${fiche.name} : aucune image trouvée`); continue; }
        fiche.photoUrl = found;
        writeFileSync(file, JSON.stringify(fiche, null, 2) + '\n');
        console.log(`✓ ${fiche.name} : ${found}`);
    } catch (e) { console.log(`✗ ${fiche.name} : ${e.message}`); }
}
