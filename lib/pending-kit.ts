/**
 * Lien d'activation venu de la boutique : `/?activer=<kitId>&code=<code>`.
 * Le kit est mis de côté le temps que la cliente se connecte ou crée son compte,
 * et le code est retiré de la barre d'adresse.
 */
export type PendingKit = { kitId: string; code: string };

const KEY = 'faienca:pending-kit';

/** Lit le kit en attente (adresse puis sessionStorage) sans le consommer. */
export function peekPendingKit(): PendingKit | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(location.search);
    const kitId = params.get('activer');
    if (kitId) {
        const pending = { kitId, code: params.get('code') ?? '' };
        try { sessionStorage.setItem(KEY, JSON.stringify(pending)); } catch { /* navigation privée : on garde l'adresse */ return pending; }
        params.delete('activer'); params.delete('code');
        const rest = params.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
        return pending;
    }
    try {
        const raw = sessionStorage.getItem(KEY);
        const value = raw ? JSON.parse(raw) as Partial<PendingKit> : null;
        return value && typeof value.kitId === 'string' ? { kitId: value.kitId, code: typeof value.code === 'string' ? value.code : '' } : null;
    } catch { return null; }
}

/** Renvoie le kit en attente et l'oublie. */
export function takePendingKit(): PendingKit | null {
    const pending = peekPendingKit();
    try { sessionStorage.removeItem(KEY); } catch { /* rien à nettoyer */ }
    return pending;
}
