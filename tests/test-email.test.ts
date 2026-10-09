import { describe, expect, it } from 'vitest';
import { isValidTestRecipient, previewMergeTags, testSubject } from '../lib/test-email';

describe('envoi test de newsletter', () => {
    it('remplace le prénom Klaviyo et retire les autres balises', () => {
        const html = "<p>Bonjour {{ first_name|default:'' }},</p><p>{{ person.first_name }} {{ organization.name }}{% unsubscribe %}</p>";
        expect(previewMergeTags(html, 'Émilie')).toBe('<p>Bonjour Émilie,</p><p>Émilie </p>');
    });

    it('préfixe l’objet', () => {
        expect(testSubject('Vous ne savez pas quel kit choisir ?')).toBe('[Test] Vous ne savez pas quel kit choisir ?');
        expect(testSubject('  ')).toBe('[Test] Newsletter Faïença');
    });

    it('valide l’adresse de test', () => {
        expect(isValidTestRecipient(' contact@faienca.fr ')).toBe(true);
        expect(isValidTestRecipient('contact@faienca')).toBe(false);
        expect(isValidTestRecipient('a@b.fr, c@d.fr')).toBe(false);
        expect(isValidTestRecipient('')).toBe(false);
    });
});
