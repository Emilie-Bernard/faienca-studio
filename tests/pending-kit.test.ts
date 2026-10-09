import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { peekPendingKit, takePendingKit } from '../lib/pending-kit';

// Navigateur minimal : adresse, historique et sessionStorage.
function browser(url: string) {
    const loc = new URL(url);
    const store = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { get search() { return loc.search; }, get pathname() { return loc.pathname; }, get hash() { return loc.hash; } });
    vi.stubGlobal('history', { replaceState: (_: unknown, __: string, next: string) => { const n = new URL(next, loc); loc.search = n.search; loc.hash = n.hash; } });
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    return { loc, store };
}

describe('lien d’activation depuis la boutique', () => {
    beforeEach(() => vi.unstubAllGlobals());
    afterEach(() => vi.unstubAllGlobals());

    it('met le kit de côté et retire le code de l’adresse', () => {
        const { loc } = browser('https://studio.test/?activer=kit123&code=CIGALE-26&vue=catalogue');
        expect(peekPendingKit()).toEqual({ kitId: 'kit123', code: 'CIGALE-26' });
        expect(loc.search).toBe('?vue=catalogue');
        // Toujours là après la connexion (adresse nettoyée), puis consommé une seule fois.
        expect(takePendingKit()).toEqual({ kitId: 'kit123', code: 'CIGALE-26' });
        expect(takePendingKit()).toBeNull();
    });

    it('ne fait rien sans lien d’activation', () => {
        browser('https://studio.test/');
        expect(takePendingKit()).toBeNull();
    });

    it('accepte un kit sans code', () => {
        browser('https://studio.test/?activer=kit123');
        expect(takePendingKit()).toEqual({ kitId: 'kit123', code: '' });
    });

    it('ignore un contenu mis de côté invalide', () => {
        const { store } = browser('https://studio.test/');
        store.set('faienca:pending-kit', '{"kitId":42}');
        expect(takePendingKit()).toBeNull();
    });
});
