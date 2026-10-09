export interface KlaviyoConfig {
  apiKey: string;
  revision?: string;
}

export interface KlaviyoSender {
  fromEmail: string;
  fromLabel: string;
  replyToEmail?: string;
}

type JsonObject = Record<string, unknown>;

export class KlaviyoApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'KlaviyoApiError';
  }
}

export class KlaviyoClient {
  private revision: string;

  constructor(private config: KlaviyoConfig) {
    this.revision = config.revision ?? '2026-01-15';
  }

  private async request<T>(method: string, path: string, body?: JsonObject): Promise<T> {
    const response = await fetch(`https://a.klaviyo.com${path}`, {
      method,
      headers: {
        Authorization: `Klaviyo-API-Key ${this.config.apiKey}`,
        revision: this.revision,
        accept: 'application/vnd.api+json',
        ...(body ? { 'content-type': 'application/vnd.api+json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new KlaviyoApiError(response.status, `Klaviyo ${response.status}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) as T : {} as T;
  }

  async createTemplate(name: string, html: string) {
    const data = await this.request<{ data: { id: string } }>('POST', '/api/templates', {
      data: {
        type: 'template',
        attributes: { name, editor_type: 'CODE', html },
      },
    });
    return data.data.id;
  }

  async updateTemplate(templateId: string, html: string, name?: string) {
    await this.request('PATCH', `/api/templates/${templateId}`, {
      data: {
        type: 'template',
        id: templateId,
        attributes: { ...(name ? { name } : {}), html },
      },
    });
  }

  async createEmailCampaign(name: string, listId: string, sender: KlaviyoSender, subject: string, previewText: string, sendDatetime: string) {
    const data = await this.request<{ data: { id: string; relationships?: { 'campaign-messages'?: { data?: Array<{ id: string }> } } } }>('POST', '/api/campaigns', {
      data: {
        type: 'campaign',
        attributes: {
          name,
          audiences: { included: [listId] },
          // Révision 2024-10-15 et suivantes : `datetime` directement sous send_strategy (plus de `options_static`).
          send_strategy: {
            method: 'static',
            datetime: sendDatetime,
            options: { is_local: false },
          },
          'campaign-messages': {
            data: [{
              type: 'campaign-message',
              attributes: {
                definition: {
                  channel: 'email',
                  label: name,
                  content: {
                    subject,
                    preview_text: previewText,
                    from_email: sender.fromEmail,
                    from_label: sender.fromLabel,
                    reply_to_email: sender.replyToEmail ?? sender.fromEmail,
                  },
                },
              },
            }],
          },
        },
      },
    });
    const messageId = data.data.relationships?.['campaign-messages']?.data?.[0]?.id;
    if (!messageId) {
      const messages = await this.getCampaignMessages(data.data.id);
      return { campaignId: data.data.id, messageId: messages[0]!.id };
    }
    return { campaignId: data.data.id, messageId };
  }

  async getCampaignMessages(campaignId: string) {
    const data = await this.request<{ data: Array<{ id: string }> }>('GET', `/api/campaigns/${campaignId}/campaign-messages/`);
    return data.data;
  }

  async assignTemplateToCampaignMessage(messageId: string, templateId: string) {
    await this.request('POST', '/api/campaign-message-assign-template', {
      data: {
        type: 'campaign-message',
        id: messageId,
        relationships: { template: { data: { type: 'template', id: templateId } } },
      },
    });
  }

  async createFlow(name: string, definition: JsonObject) {
    const data = await this.request<{ data: { id: string; attributes?: { definition?: JsonObject } } }>('POST', '/api/flows', {
      data: {
        type: 'flow',
        attributes: { name, definition },
      },
    });
    return { flowId: data.data.id, definition: data.data.attributes?.definition };
  }

  async getFlowDefinition(flowId: string) {
    const data = await this.request<{ data: { attributes: { definition: JsonObject } } }>(
      'GET',
      `/api/flows/${flowId}?additional-fields[flow]=definition`,
    );
    return data.data.attributes.definition;
  }

  async updateFlowAction(actionId: string, definition: JsonObject) {
    await this.request('PATCH', `/api/flow-actions/${actionId}`, {
      data: { type: 'flow-action', id: actionId, attributes: { definition } },
    });
  }

  async deleteFlow(flowId: string) {
    try {
      await this.request('DELETE', `/api/flows/${flowId}`);
    } catch (error) {
      if (error instanceof KlaviyoApiError && error.status === 404) return;
      throw error;
    }
  }

  async updateTemplateOnFlowMessage(flowMessageId: string, templateId: string) {
    await this.request('PATCH', `/api/flow-messages/${flowMessageId}`, {
      data: {
        type: 'flow-message',
        id: flowMessageId,
        relationships: { template: { data: { type: 'template', id: templateId } } },
      },
    });
  }
}

export function klaviyoCampaignUrl(campaignId: string) {
  return `https://www.klaviyo.com/campaign/${campaignId}/wizard/1`;
}

export function klaviyoFlowUrl(flowId: string) {
  return `https://www.klaviyo.com/flow/${flowId}/edit`;
}
