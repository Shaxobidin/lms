/**
 * Maqsad: OTP endpointlari (F-01).
 */

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { requestOtpSchema, verifyOtpSchema } from '@lms/shared';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/auth/decorators';
import { OtpService, type OtpPurpose } from './otp.service';

@ApiTags('auth')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "SMS orqali bir martalik kod so'rash" })
  async request(@Body(zodBody(requestOtpSchema)) dto: { phone: string; purpose: OtpPurpose }) {
    return this.otp.request(dto.phone, dto.purpose);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bir martalik kodni tekshirish' })
  async verify(
    @Body(zodBody(verifyOtpSchema)) dto: { phone: string; code: string; purpose: OtpPurpose },
  ) {
    const result = await this.otp.verify(dto.phone, dto.code, dto.purpose);
    return { verified: true, userLinked: Boolean(result.userId) };
  }
}
