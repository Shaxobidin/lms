/**
 * Maqsad: rate limit guardining rolga qarab farqlanishini tekshirish (§8).
 *
 * Nima uchun kerak: `RateLimitService` limitlar jadvali bilan mavjud edi,
 * lekin uni CHAQIRADIGAN joy yo'q edi — cheklov amalda ishlamasdi. Bu testlar
 * guardning identifikatorni to'g'ri tanlashini va limitdan oshganda 429
 * qaytarishini kafolatlaydi.
 */

import { RateLimitGuard } from './rate-limit.guard';
import type { RateLimitService } from './rate-limit.service';
import { AppException } from '../errors/app.exception';
import { SKIP_RATE_LIMIT_KEY } from '../auth/decorators';

interface Recorded {
  identifier: string;
  roles: readonly string[];
}

function buildContext(request: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
    headers,
  };
}

function buildGuard(options: {
  allowed: boolean;
  remaining?: number;
  enabled?: boolean;
  skip?: boolean;
  recorded?: Recorded[];
}) {
  const service = {
    checkApi: (identifier: string, roles: readonly string[]) => {
      options.recorded?.push({ identifier, roles });
      return Promise.resolve({
        allowed: options.allowed,
        remaining: options.remaining ?? 10,
        retryAfterSeconds: options.allowed ? 0 : 42,
      });
    },
    assert: (result: { allowed: boolean; retryAfterSeconds: number }) => {
      if (!result.allowed) {
        throw new AppException({
          code: 'RATE_LIMITED',
          messageKey: 'errors.rate_limited',
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    },
  } as unknown as RateLimitService;

  const reflector = {
    getAllAndOverride: (key: string) => (key === SKIP_RATE_LIMIT_KEY ? options.skip : undefined),
  } as never;

  const config = {
    get: () => options.enabled ?? true,
  } as never;

  return new RateLimitGuard(reflector, service, config);
}

describe('RateLimitGuard', () => {
  it('autentifikatsiyalangan foydalanuvchini `user:<id>` bo`yicha hisoblaydi', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: true, recorded });
    const context = buildContext({ user: { id: 'u-1', roles: ['TEACHER'] }, headers: {} });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(recorded).toEqual([{ identifier: 'user:u-1', roles: ['TEACHER'] }]);
  });

  it('anonim so`rovni IP bo`yicha hisoblaydi', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: true, recorded });
    const context = buildContext({ headers: {}, ip: '10.0.0.7' });

    await guard.canActivate(context as never);
    expect(recorded[0]).toEqual({ identifier: 'ip:10.0.0.7', roles: [] });
  });

  it('Nginx ortida `X-Forwarded-For` dagi birinchi manzilni oladi', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: true, recorded });
    const context = buildContext({
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      ip: '10.0.0.1',
    });

    await guard.canActivate(context as never);
    expect(recorded[0]?.identifier).toBe('ip:203.0.113.9');
  });

  it('bir nechta rolda hammasi uzatiladi (xizmat eng kengini tanlaydi)', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: true, recorded });
    const context = buildContext({
      user: { id: 'u-2', roles: ['STUDENT', 'TEACHER'] },
      headers: {},
    });

    await guard.canActivate(context as never);
    expect(recorded[0]?.roles).toEqual(['STUDENT', 'TEACHER']);
  });

  it('qolgan limitni sarlavhaga yozadi', async () => {
    const guard = buildGuard({ allowed: true, remaining: 297 });
    const context = buildContext({ user: { id: 'u-3', roles: ['STUDENT'] }, headers: {} });

    await guard.canActivate(context as never);
    expect(context.headers['X-RateLimit-Remaining']).toBe('297');
  });

  it('limitdan oshganda 429 tashlaydi', async () => {
    const guard = buildGuard({ allowed: false });
    const context = buildContext({ user: { id: 'u-4', roles: ['STUDENT'] }, headers: {} });

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('`RATE_LIMIT_ENABLED=false` bo`lsa umuman tekshirmaydi', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: false, enabled: false, recorded });
    const context = buildContext({ user: { id: 'u-5', roles: ['STUDENT'] }, headers: {} });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(recorded).toHaveLength(0);
  });

  it('`@SkipRateLimit()` belgilangan endpointni o`tkazib yuboradi', async () => {
    const recorded: Recorded[] = [];
    const guard = buildGuard({ allowed: false, skip: true, recorded });
    const context = buildContext({ headers: {}, ip: '10.0.0.9' });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(recorded).toHaveLength(0);
  });
});
