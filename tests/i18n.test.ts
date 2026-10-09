import { describe, expect, it } from 'vitest';
import { fill, LOCALES, MESSAGES, pickLocale, translateServerMessage } from '../lib/i18n';

describe('pickLocale', () => {
    it('garde la langue choisie dans le sélecteur', () => {
        expect(pickLocale('es', 'en-US,en;q=0.9')).toBe('es');
    });
    it('ignore un cookie inconnu', () => {
        expect(pickLocale('de', 'fr-FR,fr;q=0.9')).toBe('fr');
    });
    it('suit la première langue prise en charge du navigateur, selon q', () => {
        expect(pickLocale(undefined, 'de-DE,es;q=0.8,en;q=0.9')).toBe('en');
        expect(pickLocale(undefined, 'es-MX,es;q=0.9')).toBe('es');
    });
    it('français sans en-tête, anglais pour une langue non prise en charge', () => {
        expect(pickLocale(undefined, null)).toBe('fr');
        expect(pickLocale(undefined, 'de-DE,de;q=0.9')).toBe('en');
    });
});

describe('traductions', () => {
    const keys = (o: object, prefix = ''): string[] => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? keys(v, prefix + k + '.') : [prefix + k]);
    it('chaque langue a les mêmes textes, non vides', () => {
        for (const locale of LOCALES) {
            expect(keys(MESSAGES[locale])).toEqual(keys(MESSAGES.fr));
            for (const k of keys(MESSAGES[locale])) {
                const value = k.split('.').reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], MESSAGES[locale]);
                expect(typeof value === 'function' || (typeof value === 'string' && value.trim().length > 0), `${locale}.${k}`).toBe(true);
            }
        }
    });
    it('remplace les variables', () => {
        expect(fill(MESSAGES.en.client.hello, { name: 'Ana' })).toBe('Hello Ana.');
        expect(MESSAGES.es.client.videoLessons(2)).toBe('2 lecciones en vídeo');
    });
    it('traduit les erreurs connues du serveur et laisse les autres', () => {
        expect(translateServerMessage('Kit introuvable.', 'en')).toBe('Kit not found.');
        expect(translateServerMessage('Kit introuvable.', 'fr')).toBe('Kit introuvable.');
        expect(translateServerMessage('Autre message.', 'es')).toBe('Autre message.');
    });
});
