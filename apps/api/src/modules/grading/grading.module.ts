/** Maqsad: F-08 modulini yig'ish. Baholash servisi boshqa modullarga ham kerak. */

import { Module } from '@nestjs/common';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';

@Module({
  controllers: [GradingController],
  providers: [GradingService],
  exports: [GradingService],
})
export class GradingModule {}
