import { ConfigService } from '@nestjs/config';
import {
  WhatsappMessagingService,
  WhatsappTemplateNotConfiguredError,
} from './whatsapp-messaging.service';

function configFrom(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, def?: string) =>
      values[key] === undefined ? def : values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('WhatsappMessagingService utility templates', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts a Meta body template with three parameters and no auth button', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new WhatsappMessagingService(
      configFrom({
        WHATSAPP_PROVIDER: 'meta',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_GRAPH_API_VERSION: 'v21.0',
      }),
    );

    await svc.sendUtilityTemplate({
      label: 'order_ready',
      toE164: '+60123456789',
      metaTemplateName: 'order_ready',
      metaTemplateLang: 'en',
      bodyParameters: ['Ada', '42', 'Collect at the counter.'],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    if (typeof init.body !== 'string') {
      throw new Error('expected a JSON string body');
    }
    const body = JSON.parse(init.body) as {
      type: string;
      template: {
        name: string;
        components: { type: string; parameters: { text: string }[] }[];
      };
    };
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('order_ready');
    expect(body.template.components).toHaveLength(1);
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual([
      'Ada',
      '42',
      'Collect at the counter.',
    ]);
  });

  it('refuses to send session text when the template name is missing', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new WhatsappMessagingService(
      configFrom({
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
      }),
    );

    await expect(
      svc.sendUtilityTemplate({
        label: 'order_ready',
        toE164: '+60123456789',
        bodyParameters: ['Ada', '42', 'Collect at the counter.'],
      }),
    ).rejects.toBeInstanceOf(WhatsappTemplateNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
