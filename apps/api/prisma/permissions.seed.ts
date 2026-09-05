/**
 * Maqsad: rollar va ruxsatlar matritsasini bazaga yozish (promt.md §3).
 *
 * MATRITSA DEKLARATIV: yagona haqiqat manbai `@lms/shared/rbac/permissions.ts`
 * dagi `ROLE_PERMISSION_MATRIX`. Ushbu fayl faqat uni bazaga ko'chiradi.
 *
 * Bu ajratish ataylab: matritsa frontendga ham kerak (UI elementlarini
 * yashirish uchun), shuning uchun u umumiy paketda turadi; bazaga yozish esa
 * backend mas'uliyati.
 *
 * Ishga tushirish idempotent: bir necha marta bajarilsa ham dublikat yaratmaydi
 * va matritsadan olib tashlangan ruxsatlar roldan yechiladi.
 */

import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  parsePermission,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
} from '@lms/shared';

export async function seedPermissions(prisma: PrismaClient): Promise<{
  permissions: number;
  roles: number;
  assignments: number;
}> {
  // 1. Ruxsatlar katalogi
  for (const key of ALL_PERMISSIONS) {
    const parsed = parsePermission(key);
    if (!parsed) throw new Error(`Noto'g'ri ruxsat kaliti: ${key}`);

    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        resource: parsed.resource,
        action: parsed.action,
        scope: parsed.scope,
      },
      update: {
        resource: parsed.resource,
        action: parsed.action,
        scope: parsed.scope,
      },
    });
  }

  const permissionRows = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permissionMap = new Map(permissionRows.map((row) => [row.key, row.id]));

  // 2. Rollar
  let assignments = 0;

  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        ordinal: definition.ordinal,
        name: definition.name,
        isSystem: true,
      },
      update: {
        ordinal: definition.ordinal,
        name: definition.name,
      },
      select: { id: true },
    });

    const desiredKeys = ROLE_PERMISSION_MATRIX[definition.code] ?? [];
    const desiredIds = new Set(
      desiredKeys.map((key) => permissionMap.get(key)).filter((id): id is string => Boolean(id)),
    );

    const current = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const currentIds = new Set(current.map((row) => row.permissionId));

    // Qo'shish
    for (const permissionId of desiredIds) {
      if (!currentIds.has(permissionId)) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
        assignments += 1;
      }
    }

    // Matritsadan olib tashlanganlarni yechish — bu qadam muhim:
    // ruxsatni olib tashlash ham deklarativ bo'lishi kerak
    const toRemove = Array.from(currentIds).filter((id) => !desiredIds.has(id));
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
    }
  }

  return {
    permissions: ALL_PERMISSIONS.length,
    roles: ROLE_DEFINITIONS.length,
    assignments,
  };
}
