/**
 * Maqsad: integratsiyalarni boshqarish endpointlari (F-17, §10).
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { uuidSchema } from '@lms/shared';
import { HemisSyncService } from './hemis-sync.service';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { QueueService } from '../../common/queue/queue.service';

const syncSchema = z.object({
  entity: z.enum(['students', 'teachers', 'curricula']),
  since: z.coerce.date().optional(),
});

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly hemisSync: HemisSyncService,
    private readonly queue: QueueService,
  ) {}

  @Post('hemis/sync')
  @RequirePermission(['integration:manage:all', 'integration:read:all'])
  @ApiOperation({ summary: 'HEMIS sinxronizatsiyasini ishga tushirish (navbatda)' })
  async sync(
    @Body(zodBody(syncSchema)) dto: { entity: string; since?: Date },
    @CurrentUser() actor: RequestUser,
  ) {
    const jobId = await this.queue.enqueue('integration.hemis.sync', {
      entity: dto.entity,
      since: dto.since?.toISOString(),
    });
    return { jobId, requestedBy: actor.id, entity: dto.entity };
  }

  @Post('hemis/push-grades')
  @RequirePermission('integration:manage:all')
  @ApiOperation({ summary: 'Yakuniy baholarni HEMIS ga yuborish' })
  async pushGrades(
    @Body(zodBody(z.object({ semesterId: uuidSchema }))) dto: { semesterId: string },
  ) {
    return this.hemisSync.pushGrades(dto.semesterId);
  }

  @Get('logs')
  @RequirePermission(['integration:read:all', 'integration:manage:all'])
  @ApiOperation({ summary: 'Sinxronizatsiya jurnallari' })
  async logs(
    @Query(zodQuery(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) })))
    query: {
      limit: number;
    },
  ) {
    return this.hemisSync.recentLogs(query.limit);
  }
}
