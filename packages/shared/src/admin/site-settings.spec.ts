import { describe, expect, it } from 'vitest';
import {
  SITE_ADMIN_TREE,
  SITE_SETTING_FIELDS,
  findSiteSection,
  ipMatches,
  isIpAllowed,
  siteSectionSchema,
} from './site-settings';

describe('site-settings reestri', () => {
  it('kalitlar takrorlanmaydi va har biri nom hududiga ega', () => {
    const keys = SITE_SETTING_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[a-z0-9]+\.[A-Za-z0-9]+$/.test(key))).toBe(true);
    // Bo'lim id lari ham takrorlanmaydi
    const ids = SITE_ADMIN_TREE.flatMap((category) => category.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('har bir maydon 4 tilda yorliqqa ega va standart qiymati sxemadan o`tadi', () => {
    for (const category of SITE_ADMIN_TREE) {
      for (const section of category.sections) {
        const schema = siteSectionSchema(section);
        const defaults = Object.fromEntries(
          section.fields.filter((f) => !f.readonly).map((field) => [field.key, field.default]),
        );
        const parsed = schema.safeParse(defaults);
        expect(
          parsed.success,
          `${section.id}: ${JSON.stringify(parsed.success ? '' : parsed.error.issues)}`,
        ).toBe(true);
        for (const field of section.fields) {
          expect(Object.keys(field.label).sort()).toEqual(['en', 'ru', 'uz-Cyrl', 'uz-Latn']);
        }
      }
    }
  });

  it('bo`lim sxemasi noma`lum kalit va noto`g`ri turni rad etadi', () => {
    const section = findSiteSection('site-policies')!;
    const schema = siteSectionSchema(section);
    expect(schema.safeParse({ 'security.passwordMinLength': 4 }).success).toBe(false);
    expect(schema.safeParse({ 'security.passwordMinLength': 12 }).success).toBe(true);
    expect(schema.safeParse({ 'security.unknown': true }).success).toBe(false);
    const notifications = findSiteSection('notification-settings')!;
    expect(
      siteSectionSchema(notifications).safeParse({ 'notifications.quietHoursStart': '25:00' })
        .success,
    ).toBe(false);
    expect(
      siteSectionSchema(notifications).safeParse({ 'notifications.quietHoursStart': '23:30' })
        .success,
    ).toBe(true);
  });

  it('IP moslashuvi: aniq, prefiks, CIDR; taqiq ro`yxati ustun', () => {
    expect(ipMatches('203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(ipMatches('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(ipMatches('192.168.1.10', ['192.168.'])).toBe(true);
    expect(ipMatches('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(ipMatches('11.1.2.3', ['10.0.0.0/8'])).toBe(false);
    expect(ipMatches('203.0.113.8', ['203.0.113.7'])).toBe(false);
    expect(isIpAllowed('1.2.3.4', [], [])).toBe(true);
    expect(isIpAllowed('1.2.3.4', ['1.2.3.0/24'], [])).toBe(true);
    expect(isIpAllowed('1.2.4.4', ['1.2.3.0/24'], [])).toBe(false);
    expect(isIpAllowed('1.2.3.4', ['1.2.3.0/24'], ['1.2.3.4'])).toBe(false);
  });
});
