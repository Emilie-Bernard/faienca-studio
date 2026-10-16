import { describe, expect, it } from 'vitest';
import { normalizeRichText, plainToHtml, richTextToPlain, sanitizeRichText } from '../lib/rich-text';
import { adminRequestsEmail, requestAcceptedEmail } from '../lib/request-email';

describe('description mise en forme', () => {
    it('garde la mise en forme de l’éditeur', () => {
        const html = '<h2>Niveau</h2><p><strong>Débutant</strong> et <em>doux</em></p><ul><li><p>Fil</p></li></ul>';
        expect(sanitizeRichText(html)).toBe(html);
    });
    it('retire scripts, attributs et liens dangereux', () => {
        const out = sanitizeRichText('<p onclick="x()" style="color:red">Hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">a</a><a href="https://faienca.fr">b</a></p>');
        expect(out).toBe('<p>Hi<a>a</a><a href="https://faienca.fr" target="_blank" rel="noopener noreferrer">b</a></p>');
    });
    it('affiche un ancien texte brut en paragraphes, échappé', () => {
        expect(sanitizeRichText('Un <b>\n\nDeux\nTrois')).toBe('<p>Un &lt;b&gt;</p><p>Deux<br>Trois</p>');
        expect(plainToHtml('')).toBe('');
    });
    it('donne un extrait sans balises pour la carte', () => {
        expect(richTextToPlain('<h2>Titre</h2><p>L&#39;été &amp; la mer</p>')).toBe('Titre\nL\'été & la mer');
        expect(richTextToPlain('Texte brut')).toBe('Texte brut');
    });
    it('enregistre une description vide quand l’éditeur est vide', () => {
        expect(normalizeRichText('<p></p>')).toBe('');
        expect(normalizeRichText('<p>ok</p>')).toBe('<p>ok</p>');
    });
});

describe('e-mails des demandes d’activation', () => {
    const r = { name: 'Léa <b>', email: 'lea@example.com', kitTitle: 'Citron', message: 'Achat sur Etsy', createdAt: 0 };
    it('liste les demandes en attente pour l’administratrice, échappées', () => {
        const { subject, html, text } = adminRequestsEmail({ latest: r, pending: [r, { ...r, kitTitle: 'Lavande' }], studioUrl: 'https://studio.faienca.fr/?vue=Demandes', logoUrl: 'https://studio.faienca.fr/brand/logo-email.png' });
        expect(subject).toContain('Citron');
        expect(html).toContain('2 demandes en attente');
        expect(html).toContain('Léa &lt;b&gt;');
        expect(html).not.toContain('Léa <b>');
        expect(text).toContain('Lavande');
    });
    it('prévient la cliente dans sa langue', () => {
        const { subject, html } = requestAcceptedEmail({ locale: 'es', firstName: 'Ana', kitTitle: 'Citron', coverUrl: '', kitUrl: 'https://studio.faienca.fr/?kit=1', logoUrl: 'https://studio.faienca.fr/brand/logo-email.png', upcoming: false });
        expect(subject).toBe('Tu kit «Citron» está activado');
        expect(html).toContain('lang="es"');
    });
});
