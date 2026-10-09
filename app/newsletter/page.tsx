'use client';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, Flower2 } from 'lucide-react';
import { LanguageSwitcher, Lines, useI18n } from '../i18n';

export default function NewsletterPage() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t: { newsletter: t, tagline }, server } = useI18n();

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
        setError(data.error ? server(data.error) : t.failed);
        return;
      }
      setMessage(data.message ? server(data.message) : t.thanks);
      setEmail('');
      setConsent(false);
      form.reset();
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome newsletter-page">
      <div className="welcome-brand">
        <Flower2 size={40} />
        <span>faïença<span className="studio-word">NEWSLETTER</span></span>
        <LanguageSwitcher />
      </div>
      <section>
        <div className="eyebrow">{t.eyebrow}</div>
        <h1><Lines text={t.title} /></h1>
        <p>{t.intro}</p>
        <form className="newsletter-form" onSubmit={submit}>
          <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="newsletter-honeypot" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t.placeholder}
            aria-label={t.emailLabel}
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={busy}
          />
          <label className="newsletter-consent">
            <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />
            <span>{t.consent}</span>
          </label>
          <Button type="submit" disabled={busy || !consent}>
            {busy ? t.subscribing : t.subscribe}
            <ArrowUpRight size={18} />
          </Button>
        </form>
        {message && <p className="newsletter-success" role="status">{message}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <small className="newsletter-note">{t.note}</small>
      </section>
      <footer>{tagline}</footer>
    </main>
  );
}
