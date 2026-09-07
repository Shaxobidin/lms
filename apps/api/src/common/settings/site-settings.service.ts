/**
 * Maqsad: sayt boshqaruvi sozlamalarini (F-17, Moodle "Site administration")
 * o'qish — reestrdagi standart qiymat bilan, qisqa muddat keshlangan holda.
 *
 * Yozish `AdminService.updateSiteSection` da; u yerda kesh ham tozalanadi.
 * Servis `CommonModule` orqali global: guard'lar (IP bloklovchi), auth va
 * xabarlar servisi shu yerdan o'qiydi.
 */

import { Injectable } from '@nestjs/common';
import { SITE_SETTING_DEFAULTS, findSiteField } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const SITE_SETTING_TTL = 30;

@Injectable()
export class SiteSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Bitta sozlama: bazadagi qiymat, bo'lmasa reestr standarti. */
  async get<T>(key: string): Promise<T> {
    const value = await this.cache.remember<{ value: unknown }>(
      `site:setting:${key}`,
      SITE_SETTING_TTL,
      async () => {
        const row = await this.prisma.setting.findUnique({
          where: { key },
          select: { value: true },
        });
        return { value: row ? row.value : SITE_SETTING_DEFAULTS[key] };
      },
    );
    // Reestrda bor kalit uchun tur mos kelmasa (eski/buzuq yozuv) — standart
    const field = findSiteField(key);
    if (field && !this.matchesType(field.type, value.value)) return field.default as T;
    return (value.value ?? SITE_SETTING_DEFAULTS[key]) as T;
  }

  async getBoolean(key: string): Promise<boolean> {
    return this.get<boolean>(key);
  }

  async getList(key: string): Promise<string[]> {
    const value = await this.get<unknown>(key);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  /** Yozuvdan keyin chaqiriladi — keyingi o'qish bazadan bo'ladi. */
  async invalidate(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.cache.del(...keys.map((key) => `site:setting:${key}`));
  }

  private matchesType(type: string, value: unknown): boolean {
    switch (type) {
      case 'boolean':
        return typeof value === 'boolean';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'string':
      case 'text':
      case 'color':
      case 'select':
        return typeof value === 'string';
      case 'multiselect':
      case 'list':
        return Array.isArray(value);
      case 'json':
        return typeof value === 'object' && value !== null;
      default:
        return true;
    }
  }
}
