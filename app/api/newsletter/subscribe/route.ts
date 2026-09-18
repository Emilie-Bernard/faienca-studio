import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { NextResponse } from 'next/server';
import { subscribeEmailToList } from '../../../../lib/klaviyo';
import { validateSubscribePayload } from '../../../../lib/newsletter';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const parsed = validateSubscribePayload(body);
  if (!parsed.ok) {
    if (parsed.honeypot) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  const listId = process.env.KLAVIYO_NEWSLETTER_LIST_ID;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const ingestSecret = process.env.NEWSLETTER_INGEST_SECRET;

  if (!apiKey || !listId || !convexUrl || !ingestSecret) {
    return NextResponse.json({ error: 'Inscription temporairement indisponible.' }, { status: 503 });
  }

  const client = new ConvexHttpClient(convexUrl);
  let klaviyoJobId: string | undefined;

  try {
    const result = await subscribeEmailToList(parsed.email, {
      apiKey,
      listId,
      revision: process.env.KLAVIYO_REVISION,
    });
    klaviyoJobId = result.jobId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Klaviyo';
    await client.mutation(anyApi.newsletter.upsertSubscriber, {
      secret: ingestSecret,
      email: parsed.email,
      status: 'pending',
      source: 'web_form',
      lastError: message,
    });
    return NextResponse.json({ error: 'Impossible de finaliser l’inscription. Réessayez plus tard.' }, { status: 502 });
  }

  await client.mutation(anyApi.newsletter.upsertSubscriber, {
    secret: ingestSecret,
    email: parsed.email,
    status: 'pending',
    source: 'web_form',
    klaviyoJobId,
  });

  return NextResponse.json({
    ok: true,
    message: 'Merci ! Si votre liste utilise la double confirmation, vérifiez votre boîte mail pour valider l’inscription.',
  });
}
