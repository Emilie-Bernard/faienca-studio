import { describe, expect, it } from 'vitest';
import { clientPath, parseClientPath, parseStudioPath, parseTraineePath, studioPath, studioRoutes, traineePath } from '../lib/routes';

describe('Adresses des espaces stagiaire et brodeuse', () => {
    it('donnent une adresse à chaque onglet et à la fiche ouverte', () => {
        expect(parseTraineePath('/')).toEqual({ tab: 'missions', missionId: null, veille: '' });
        expect(parseTraineePath('/missions/m1')).toEqual({ tab: 'missions', missionId: 'm1', veille: '' });
        expect(parseTraineePath('/projets').tab).toBe('projects');
        expect(parseTraineePath('/veille/atelier/w1')).toEqual({ tab: 'veille', missionId: null, veille: 'atelier/w1' });
        expect(parseTraineePath('/depenses')).toEqual({ tab: 'missions', missionId: null, veille: '' });
        for (const p of ['/', '/missions/m1', '/projets', '/bibliotheque', '/veille', '/veille/ateliers', '/veille/atelier/w1']) expect(traineePath(parseTraineePath(p))).toBe(p);
        expect(parseClientPath('/kits/k1')).toEqual({ view: 'kits', kitId: 'k1' });
        expect(parseClientPath('/catalogue')).toEqual({ view: 'catalogue', kitId: null });
        expect(parseClientPath('/veille')).toEqual({ view: 'kits', kitId: null });
        for (const p of ['/', '/catalogue', '/kits/k1']) expect(clientPath(parseClientPath(p))).toBe(p);
    });
});

describe('Adresses du studio', () => {
    it('donne une adresse à chaque page, et aux fiches ouvertes', () => {
        expect(studioPath('Accueil')).toBe('/');
        expect(studioPath('Dépenses')).toBe('/depenses');
        expect(studioPath('Newsletter')).toBe('/newsletters');
        expect(studioPath('Kits', 'k1')).toBe('/kits/k1');
        expect(studioPath('Dépenses', 'x')).toBe('/depenses');
        expect(new Set(Object.values(studioRoutes)).size).toBe(Object.keys(studioRoutes).length);
    });

    it('retrouve la page depuis l’adresse, après un rafraîchissement', () => {
        expect(parseStudioPath('/depenses')).toEqual({ view: 'Dépenses', id: null, known: true });
        expect(parseStudioPath('/Produits/abc/')).toEqual({ view: 'Produits', id: 'abc', known: true });
        expect(parseStudioPath('/veille/a1')).toEqual({ view: 'Veille textile', id: 'a1', known: true });
        expect(parseStudioPath('/')).toEqual({ view: 'Accueil', id: null, known: true });
        expect(parseStudioPath('/inconnue')).toMatchObject({ view: 'Accueil', known: false });
        expect(parseStudioPath('/depenses/123')).toMatchObject({ view: 'Accueil', known: false });
        expect(parseStudioPath('/veille/atelier/w1')).toEqual({ view: 'Veille textile', id: 'atelier/w1', known: true });
        expect(studioPath('Veille textile', 'atelier/w1')).toBe('/veille/atelier/w1');
        expect(parseStudioPath('/kits/a/b')).toMatchObject({ view: 'Accueil', known: false });
        for (const view of Object.keys(studioRoutes)) expect(parseStudioPath(studioPath(view, 'id')).view).toBe(view);
    });
});
