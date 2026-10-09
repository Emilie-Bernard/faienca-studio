/** Code à chiffres tiré avec un générateur cryptographique (sans biais de modulo). */
export function randomDigits(length: number) {
  let code = '';
  while (code.length < length) {
    const [n] = crypto.getRandomValues(new Uint8Array(1));
    if (n! < 250) code += String(n! % 10);
  }
  return code;
}

/** E-mail de réinitialisation aux couleurs Faïença (styles en ligne pour les messageries). */
export function resetEmail(code: string, minutes: number) {
  const subject = 'Votre code pour changer de mot de passe';
  const text = `Bonjour,\n\nVoici votre code pour choisir un nouveau mot de passe sur votre carnet Faïença : ${code}\n\nIl est valable ${minutes} minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail : votre mot de passe reste inchangé.\n\nÉmilie · Faïença`;
  const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:32px 16px;background:#faf6f0;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;color:#2c2825;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e4dcd1;border-radius:10px;">
<tr><td style="height:10px;background:#4553ae;border-radius:10px 10px 0 0;"></td></tr>
<tr><td style="padding:32px 32px 8px;">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#c64b2e;font-weight:600;">Mot de passe oublié</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:28px;color:#2c2825;">Votre code Faïença</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.7;">Saisissez ce code sur la page de connexion pour choisir un nouveau mot de passe.</p>
<p style="margin:0 0 22px;padding:18px;text-align:center;background:#eceefa;border-radius:8px;font-size:32px;letter-spacing:.3em;font-weight:700;color:#4553ae;">${code}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#6b625a;">Il est valable ${minutes} minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.</p>
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#8b8178;">Émilie · Faïença — Le Sud dans les idées. Le fil entre les mains.</td></tr>
</table></body></html>`;
  return { subject, text, html };
}
