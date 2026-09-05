/**
 * Maqsad: to'liq audit izi — kim, nima, qachon, qaysi IP dan (§11, ADR-014).
 *
 * Muhim: audit yozuvlari hech qachon o'chirilmaydi va yangilanmaydi — buni baza
 * darajasidagi trigger ham kafolatlaydi (migratsiya 20260904000100).
 * PII maydonlari `after`/`before` snapshotlarida maskirovka qilinadi.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Loglarda hech qachon ochiq ko'rinmasligi kerak bo'lgan maydonlar. */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'totpSecret',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'token',
  'tokenHash',
  'codeHash',
  'secret',
  'apiKey',
  'signature',
  'passportNumber',
  'pinfl',
]);

export interface AuditRecordInput {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Audit yozuvini qo'shadi.
   *
   * Audit yozuvining muvaffaqiyatsizligi asosiy amalni bekor qilmasligi kerak
   * (aks holda baho qo'yish audit tufayli uzilib qolardi), ammo bu xato
   * ALBATTA loglanadi — jimgina yutilmaydi.
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          before: maskSensitive(input.before) as never,
          after: maskSensitive(input.after) as never,
          ip: input.ip ?? null,
          userAgent: input.userAgent?.slice(0, 512) ?? null,
          traceId: input.traceId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        { action: input.action, resource: input.resource, error: (error as Error).message },
        "Audit yozuvini saqlab bo'lmadi",
      );
    }
  }

  /**
   * O'zgarishni ikki holat farqi bilan qayd etadi.
   * Faqat haqiqatan o'zgargan maydonlar saqlanadi — audit jadvali hajmini
   * bir necha barobar kamaytiradi.
   */
  async recordChange(
    input: Omit<AuditRecordInput, 'before' | 'after'> & {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    },
  ): Promise<void> {
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};

    for (const key of new Set([...Object.keys(input.before), ...Object.keys(input.after)])) {
      const oldValue = input.before[key];
      const newValue = input.after[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedBefore[key] = oldValue;
        changedAfter[key] = newValue;
      }
    }

    if (Object.keys(changedAfter).length === 0) return;

    await this.record({ ...input, before: changedBefore, after: changedAfter });
  }
}

/**
 * Maxfiy maydonlarni rekursiv ravishda `***` bilan almashtiradi.
 * Massivlar va ichma-ich obyektlar ham qamrab olinadi.
 */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 6) return '[chuqurlik chegarasi]';

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => maskSensitive(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_FIELDS.has(key) ? '***' : maskSensitive(item, depth + 1);
    }
    return result;
  }

  return value;
}
