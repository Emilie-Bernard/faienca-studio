'use client';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Flower2 } from 'lucide-react';
import '../globals.css';

export default function NewsletterPage() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          website: (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '',
        }),
      });
      const data = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Inscription impossible pour le moment.');
        return;
      }
      setMessage(data.message ?? 'Merci pour votre inscription !');
      setEmail('');
      setConsent(false);
      form.reset();
    } catch {
      setError('Connexion impossible. Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome newsletter-page">
      <div className="welcome-brand">
        <Flower2 size={40} />
        <span>faïença<span className="studio-word">NEWSLETTER</span></span>
      </div>
      <section>
        <div className="eyebrow">LE FIL ENTRE VOS MAINS</div>
        <h1>Recevez nos actualités<br />et nos belles idées créatives.</h1>
        <p>Astuces, coulisses de l’atelier et nouveautés Faïença — directement dans votre boîte mail.</p>
        <form className="newsletter-form" onSubmit={submit}>
          <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="newsletter-honeypot" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Votre adresse e-mail"
            aria-label="Adresse e-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={busy}
          />
          <label className="newsletter-consent">
            <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />
            <span>J’accepte de recevoir la newsletter Faïença. Je peux me désinscrire à tout moment.</span>
          </label>
          <button className="primary" type="submit" disabled={busy || !consent}>
            {busy ? 'Inscription…' : 'S’inscrire à la newsletter'}
            <ArrowUpRight size={18} />
          </button>
        </form>
        {message && <p className="newsletter-success" role="status">{message}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <small className="newsletter-note">Après inscription, une série de mails de bienvenue peut vous être envoyée automatiquement.</small>
      </section>
      <footer>Le Sud dans les idées. Le fil entre les mains.</footer>
    </main>
  );
}
