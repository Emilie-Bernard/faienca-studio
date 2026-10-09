/** Envoi test d'une newsletter ou d'un e-mail de scénario (Resend), avant la synchro Klaviyo. */

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function isValidTestRecipient(raw: string) {
    const email = raw.trim();
    return email.length <= 254 && EMAIL.test(email);
}

/**
 * Remplace les balises de personnalisation Klaviyo par une valeur d'exemple :
 * `{{ first_name|default:'' }}` → le prénom de test, les autres balises `{{ … }}` sont retirées
 * pour que l'aperçu ressemble à ce que recevra une abonnée.
 */
export function previewMergeTags(html: string, firstName: string) {
    return html
        .replace(/\{\{\s*(?:person\.)?first_name\b[^}]*\}\}/gi, firstName)
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/\{%[^%]*%\}/g, '');
}

export function testSubject(subject: string) {
    return `[Test] ${subject.trim() || 'Newsletter Faïença'}`.slice(0, 200);
}
