/**
 * Maqsad: xAPI (Experience API 1.0.3) minimal LRS — cmi5 kontenti uchun (A-07, §12).
 *
 * Qamrov: `statements` saqlash va o'qish. To'liq LRS (state, activities,
 * agents profillari) qamrovdan tashqarida — cmi5 uchun bu subset yetarli.
 * Qo'llab-quvvatlanmaydigan imkoniyat "bor" deb ko'rsatilmaydi (§16).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { effectiveScope } from '../../common/auth/scope-filter';

@Injectable()
export class XapiService {
  private readonly logger = new Logger(XapiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bayonotni saqlaydi. `actor` maydonini mijoz yuborsa ham, u SERVER
   * tomonidagi autentifikatsiyalangan foydalanuvchi bilan almashtiriladi —
   * aks holda talaba boshqa talaba nomidan bayonot yuborishi mumkin bo'lardi.
   */
  async store(statement: Record<string, unknown>, userId: string, courseId?: string) {
    const verb = statement['verb'] as { id?: string } | undefined;
    const object = statement['object'] as { id?: string } | undefined;

    if (!verb?.id || !object?.id) {
      throw AppException.validation([
        { field: !verb?.id ? 'verb.id' : 'object.id', code: 'validation.required' },
      ]);
    }

    const safeStatement = {
      ...statement,
      actor: { objectType: 'Agent', account: { homePage: 'urn:lms', name: userId } },
      timestamp: (statement['timestamp'] as string) ?? new Date().toISOString(),
      stored: new Date().toISOString(),
    };

    const row = await this.prisma.xapiStatement.create({
      data: {
        actorUserId: userId,
        courseId: courseId ?? null,
        verbId: verb.id,
        objectId: object.id,
        statement: safeStatement as never,
      },
      select: { id: true, storedAt: true },
    });

    this.logger.debug({ statementId: row.id, verb: verb.id }, 'xAPI bayonoti saqlandi');
    return { id: row.id, stored: row.storedAt };
  }

  /**
   * Bayonotlarni o'qish. Talaba faqat o'z bayonotlarini ko'radi;
   * o'qituvchi — o'z kursi bo'yicha barchasini.
   */
  async query(actor: RequestUser, filters: { courseId?: string; verb?: string; limit: number }) {
    const canReadCourse = effectiveScope(actor, 'analytics', 'read');
    const restrictToSelf = canReadCourse === 'own' || canReadCourse === null;

    return this.prisma.xapiStatement.findMany({
      where: {
        ...(restrictToSelf ? { actorUserId: actor.id } : {}),
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.verb ? { verbId: filters.verb } : {}),
        ...(!restrictToSelf && !filters.courseId
          ? { courseId: { in: actor.scope.courseIds } }
          : {}),
      },
      orderBy: { storedAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        verbId: true,
        objectId: true,
        statement: true,
        storedAt: true,
        actorUserId: true,
      },
    });
  }
}
