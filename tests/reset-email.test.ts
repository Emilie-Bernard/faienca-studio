import { describe, expect, it } from 'vitest';
import { randomDigits, resetEmail } from '../lib/reset-email';

describe('Mot de passe oublié', () => {
    it('génère des codes à 8 chiffres variés', () => {
        const codes = Array.from({ length: 50 }, () => randomDigits(8));
        for (const c of codes) expect(c).toMatch(/^\d{8}$/);
        expect(new Set(codes).size).toBeGreaterThan(45);
    });
    it('met le code et sa durée dans les deux versions de l’e-mail', () => {
        const mail = resetEmail('12345678', 15);
        for (const body of [mail.text, mail.html]) { expect(body).toContain('12345678'); expect(body).toContain('15 minutes'); }
        expect(mail.subject).toMatch(/mot de passe/);
    });
    it('parle la langue de la cliente, le français par défaut', () => {
        expect(resetEmail('12345678', 15, 'en').subject).toBe('Your code to change your password');
        expect(resetEmail('12345678', 15, 'es').html).toContain('lang="es"');
        expect(resetEmail('12345678', 15, 'xx').subject).toMatch(/mot de passe/);
        for (const l of ['fr', 'en', 'es']) expect(resetEmail('12345678', 15, l).text).toContain('12345678');
    });
});
