/**
 * Maqsad: F-01 modulini yig'ish.
 */

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';

@Module({
  controllers: [AuthController, OtpController],
  providers: [AuthService, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
