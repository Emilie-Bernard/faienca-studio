import { describe, expect, it, vi } from 'vitest';
import { KlaviyoClient, KlaviyoApiError, klaviyoCampaignUrl, klaviyoFlowUrl } from '../lib/klaviyo-api';
import {
  buildFlowDefinition,
  campaignSendDatetime,
  computeDelayDeltas,
  extractSyncedStepIds,
  scenarioStructureFingerprint,
  wrapEmailHtml,
} from '../lib/klaviyo-sync';

describe('klaviyo-sync helpers', () => {
  it('wraps plain HTML for e-mail clients', () => {
    expect(wrapEmailHtml('<p>Bonjour</p>')).toContain('<html>');
    expect(wrapEmailHtml('<html><body>x</body></html>')).toContain('<html>');
  });

  it('calcule les deltas et refuse les délais décroissants', () => {
    expect(computeDelayDeltas([{ delayDays: 0 }, { delayDays: 2 }, { delayDays: 7 }])).toEqual([0, 2, 5]);
    expect(() => computeDelayDeltas([{ delayDays: 0 }, { delayDays: 1 }, { delayDays: 0 }])).toThrow('croissants');
  });

  it('fingerprint la structure d’un scénario', () => {
    expect(scenarioStructureFingerprint([{ delayDays: 0 }, { delayDays: 2 }])).toBe('2:0,2');
  });

  it('construit une définition de flow avec trigger liste', () => {
    const definition = buildFlowDefinition(
      [
        { id: '1', delayDays: 0, subject: 'Bienvenue', body: '<p>Hi</p>' },
        { id: '2', delayDays: 2, subject: 'Suite', body: '<p>Suite</p>' },
      ],
      ['tpl1', 'tpl2'],
      'LIST123',
      { fromEmail: 'hello@faienca.fr', fromLabel: 'Faïença' },
    );
    expect(definition.triggers).toEqual([{ type: 'list', id: 'LIST123' }]);
    expect(definition.actions).toHaveLength(3);
    expect(definition.entry_action_id).toBeTruthy();
  });

  it('extrait les IDs send-email et time-delay depuis un flow', () => {
    const definition = {
      entry_action_id: 'email-1',
      actions: [
        { id: 'email-1', type: 'send-email', links: { next: 'delay-1' } },
        { id: 'delay-1', type: 'time-delay', links: { next: 'email-2' } },
        { id: 'email-2', type: 'send-email', links: { next: null } },
      ],
    };
    expect(extractSyncedStepIds(definition)).toEqual({
      sendEmailIds: ['email-1', 'email-2'],
      delayIds: [undefined, 'delay-1'],
    });
  });

  it('formate une date d’envoi campagne', () => {
    expect(campaignSendDatetime('2026-12-24')).toBe('2026-12-24T09:00:00+01:00');
  });
});

describe('KlaviyoClient', () => {
  it('crée un template et propage les erreurs API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'TPL1' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      });
    vi.stubGlobal('fetch', fetchMock);
    const client = new KlaviyoClient({ apiKey: 'pk_test' });
    await expect(client.createTemplate('Test', '<p>x</p>')).resolves.toBe('TPL1');
    await expect(client.createTemplate('Fail', '<p>x</p>')).rejects.toBeInstanceOf(KlaviyoApiError);
  });

  it('expose des URLs Klaviyo', () => {
    expect(klaviyoCampaignUrl('ABC')).toContain('ABC');
    expect(klaviyoFlowUrl('FLOW1')).toContain('FLOW1');
  });
});
