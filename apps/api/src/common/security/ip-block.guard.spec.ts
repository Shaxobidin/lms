import type { ExecutionContext } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { IpBlockGuard, requestClientIp } from './ip-block.guard';
import type { SiteSettingsService } from '../settings/site-settings.service';

function contextFor(path: string, headers: Record<string, string>, ip = '127.0.0.1') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ path, headers, ip }) }),
  } as unknown as ExecutionContext;
}

function guardWith(allow: string[], deny: string[]) {
  const settings = {
    getList: async (key: string) => (key === 'security.ipAllowList' ? allow : deny),
  } as unknown as SiteSettingsService;
  return new IpBlockGuard(settings);
}

describe('IpBlockGuard', () => {
  it("ro'yxatlar bo'sh bo'lsa hech narsa qilmaydi", async () => {
    await expect(guardWith([], []).canActivate(contextFor('/api/v1/courses', {}))).resolves.toBe(
      true,
    );
  });

  it('taqiq ro`yxatidagi CIDR dan kelgan so`rovni 403 bilan rad etadi (x-forwarded-for birinchi IP)', async () => {
    const guard = guardWith([], ['203.0.113.0/24']);
    const ctx = contextFor('/api/v1/courses', { 'x-forwarded-for': '203.0.113.42, 10.0.0.1' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      messageKey: 'errors.ip_blocked',
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppException);
  });

  it("ruxsat ro'yxati to'ldirilsa faqat ro'yxatdagilar kiradi", async () => {
    const guard = guardWith(['10.0.0.0/8'], []);
    await expect(
      guard.canActivate(contextFor('/api/v1/courses', { 'x-forwarded-for': '10.1.2.3' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('/api/v1/courses', { 'x-forwarded-for': '192.0.2.5' })),
    ).rejects.toMatchObject({ messageKey: 'errors.ip_blocked' });
  });

  it('/health har doim ochiq, socket IP zaxira sifatida ishlatiladi', async () => {
    const guard = guardWith([], ['198.51.100.7']);
    await expect(
      guard.canActivate(contextFor('/api/v1/health', { 'x-forwarded-for': '198.51.100.7' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('/api/v1/courses', {}, '::ffff:198.51.100.7')),
    ).rejects.toMatchObject({ messageKey: 'errors.ip_blocked' });
  });

  it('requestClientIp: forwarded sarlavha, bo`lmasa request.ip', () => {
    expect(
      requestClientIp({
        headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' },
        ip: '9.9.9.9',
      } as never),
    ).toBe('1.2.3.4');
    expect(requestClientIp({ headers: {}, ip: '9.9.9.9' } as never)).toBe('9.9.9.9');
    expect(requestClientIp({ headers: { 'x-forwarded-for': '' }, ip: undefined } as never)).toBe(
      '',
    );
  });
});
