export interface KlaviyoSubscribeConfig {
  apiKey: string;
  listId: string;
  revision?: string;
}

export async function subscribeEmailToList(email: string, config: KlaviyoSubscribeConfig) {
  const revision = config.revision ?? '2026-01-15';
  const response = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${config.apiKey}`,
      revision,
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              attributes: {
                email,
                subscriptions: {
                  email: {
                    marketing: { consent: 'SUBSCRIBED' },
                  },
                },
              },
            }],
          },
        },
        relationships: {
          list: { data: { type: 'list', id: config.listId } },
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Klaviyo ${response.status}: ${text.slice(0, 300)}`);
  }
  const location = response.headers.get('location');
  const jobId = location?.split('/').filter(Boolean).pop();
  return { status: response.status, jobId };
}
