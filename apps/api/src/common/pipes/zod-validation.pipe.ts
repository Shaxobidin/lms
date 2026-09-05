/**
 * Maqsad: zod sxemalari asosida kirish ma'lumotlarini validatsiya qilish (ADR-011).
 *
 * Nima uchun `class-validator` emas: sxemalar `@lms/shared` da yagona manba
 * sifatida saqlanadi va frontend ham aynan shularni ishlatadi — kontrakt drifti
 * imkonsiz bo'ladi. Bu NestJS standartidan ongli chetlanish (promt.md §6).
 */

import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { AppException } from '../errors/app.exception';
import { zodToFieldErrors } from '../filters/all-exceptions.filter';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw AppException.validation(zodToFieldErrors(error));
      }
      throw error;
    }
  }
}

/** Qisqa yozuv: `@Body(zodBody(createCourseSchema)) dto: CreateCourseInput`. */
export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/** So'rov parametrlari uchun (query string doim satr bo'lgani uchun `coerce` kerak). */
export function zodQuery<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
