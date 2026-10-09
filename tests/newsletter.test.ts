import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import schema from '../convex/schema';
import { isValidEmail, normalizeEmail, validateSubscribePayload } from '../lib/newsletter';

const modules = import.meta.glob('../convex/**/*.ts');

beforeEach(() => {
  vi.stubEnv('OWNER_GITHUB_ID', '123');
  vi.stubEnv('NEWSLETTER_INGEST_SECRET', 'test-ingest-secret');
});

async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('users', { githubId: '123' }));
  return { t, owner: t.withIdentity({ subject: id + '|session' }), id };
}

describe('Validation newsletter', () => {
  it('normalise et valide les adresses e-mail', () => {
    expect(normalizeEmail('  Marie@Example.COM ')).toBe('marie@example.com');
    expect(isValidEmail('marie@example.com')).toBe(true);
    expect(isValidEmail('invalid')).toBe(false);
  });

  it('refuse le honeypot sans erreur visible', () => {
    expect(validateSubscribePayload({ email: 'a@b.com', website: 'spam' })).toEqual({ ok: false, honeypot: true, error: '' });
  });

  it('refuse une adresse invalide', () => {
    expect(validateSubscribePayload({ email: 'pas-un-mail' })).toEqual({ ok: false, error: 'Adresse e-mail invalide.' });
  });

  it('accepte une inscription valide', () => {
    expect(validateSubscribePayload({ email: '  test@faienca.fr ' })).toEqual({ ok: true, email: 'test@faienca.fr' });
  });
});

describe('Abonnés Convex', () => {
  it('refuse upsert sans secret valide', async () => {
    const { t } = await setup();
    await expect(t.mutation(anyApi.newsletter.upsertSubscriber, {
      secret: 'wrong',
      email: 'a@b.com',
      status: 'pending',
      source: 'web_form',
    })).rejects.toThrow('Non autorisé');
  });

  it('crée puis met à jour le même abonné', async () => {
    const { t } = await setup();
    const first = await t.mutation(anyApi.newsletter.upsertSubscriber, {
      secret: 'test-ingest-secret',
      email: 'Abonne@Example.com',
      status: 'pending',
      source: 'web_form',
      klaviyoJobId: 'job-1',
    });
    const second = await t.mutation(anyApi.newsletter.upsertSubscriber, {
      secret: 'test-ingest-secret',
      email: 'abonne@example.com',
      status: 'subscribed',
      source: 'web_form',
    });
    expect(first).toBe(second);
    const listed = await t.run(async ctx => ctx.db.query('newsletterSubscribers').collect());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.email).toBe('abonne@example.com');
    expect(listed[0]?.status).toBe('subscribed');
  });

  it('refuse la liste aux utilisateurs non propriétaires', async () => {
    const { t } = await setup();
    const other = await t.run(ctx => ctx.db.insert('users', { githubId: '456' }));
    await expect(t.withIdentity({ subject: other + '|session' }).query(anyApi.newsletter.listSubscribers, {
      paginationOpts: { numItems: 10, cursor: null },
    })).rejects.toThrow('propriétaire');
  });

  it('liste les abonnés pour la propriétaire', async () => {
    const { owner } = await setup();
    await owner.mutation(anyApi.newsletter.upsertSubscriber, {
      secret: 'test-ingest-secret',
      email: 'liste@example.com',
      status: 'pending',
      source: 'web_form',
    });
    const page = await owner.query(anyApi.newsletter.listSubscribers, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.email).toBe('liste@example.com');
  });
});

describe('HTML e-mail', () => {
  it('génère un bouton brandé et normalise le HTML vide', async () => {
    const { buildEmailButtonHtml, normalizeEmailHtml } = await import('../lib/email-html');
    const html = buildEmailButtonHtml('Découvrir', 'https://faienca.fr');
    expect(html).toContain('Découvrir');
    expect(html).toContain('https://faienca.fr');
    expect(html).toContain('background:#4553ae');
    expect(html).toContain('text-transform:uppercase');
    expect(html).toContain('border-radius:0');
    expect(buildEmailButtonHtml('Voir', 'https://faienca.fr', 'outline')).toContain('background:transparent;color:#4553ae');
    expect(normalizeEmailHtml('<p></p>')).toBe('');
  });
});

describe('Client Klaviyo', () => {
  it('envoie une requête subscribe avec consentement marketing', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202, headers: { location: '/api/profile-subscription-bulk-create-jobs/abc123/' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { subscribeEmailToList } = await import('../lib/klaviyo');
    const result = await subscribeEmailToList('test@faienca.fr', { apiKey: 'pk_test', listId: 'LIST123' });
    expect(result.status).toBe(202);
    expect(result.jobId).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[1].method).toBe('POST');
    const body = JSON.parse(String(firstCall[1].body));
    expect(body.data.relationships.list.data.id).toBe('LIST123');
    expect(body.data.attributes.profiles.data[0].attributes.email).toBe('test@faienca.fr');
    expect(body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consent).toBe('SUBSCRIBED');
  });
});
