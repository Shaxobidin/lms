/** Maqsad: LTI 1.3 Tool Provider modulini yig'ish (§10). */

import { Module } from '@nestjs/common';
import { LtiController } from './lti.controller';
import { LtiService } from './lti.service';
import { LtiServicesService } from './lti-services.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LtiController],
  providers: [LtiService, LtiServicesService],
  exports: [LtiService, LtiServicesService],
})
export class LtiModule {}
