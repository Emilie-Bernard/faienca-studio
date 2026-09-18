export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export type SubscribePayloadResult =
  | { ok: true; email: string }
  | { ok: false; error: string; honeypot?: boolean };

export function validateSubscribePayload(body: unknown): SubscribePayloadResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Requête invalide.' };
  const record = body as Record<string, unknown>;
  if (record.website) return { ok: false, honeypot: true, error: '' };
  const email = normalizeEmail(String(record.email ?? ''));
  if (!isValidEmail(email)) return { ok: false, error: 'Adresse e-mail invalide.' };
  return { ok: true, email };
}

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';

export const subscriberStatusLabels: Record<SubscriberStatus, string> = {
  pending: 'En attente de confirmation',
  subscribed: 'Inscrit',
  unsubscribed: 'Désinscrit',
};
