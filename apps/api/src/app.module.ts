/**
 * Maqsad: ilovaning ildiz moduli — barcha domen modullarini yig'adi va
 * global guard'larni o'rnatadi.
 *
 * Guard tartibi muhim: avval JWT (kontekstni to'ldiradi), keyin Policy
 * (RBAC/ABAC qarorini qabul qiladi).
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { IpBlockGuard } from './common/security/ip-block.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateEnv } from './config/configuration';
import { CommonModule } from './common/common.module';
import { TraceMiddleware } from './common/http/trace.middleware';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PolicyGuard } from './common/auth/policy.guard';
import { RateLimitGuard } from './common/http/rate-limit.guard';
import { HealthController } from './modules/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrgModule } from './modules/org/org.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { CoursesModule } from './modules/courses/courses.module';
import { ContentModule } from './modules/content/content.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { GradingModule } from './modules/grading/grading.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ClassroomModule } from './modules/classroom/classroom.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { AdminModule } from './modules/admin/admin.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LtiModule } from './modules/lti/lti.module';
import { StudentModule } from './modules/student/student.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Monorepo ildizidagi yagona .env fayl
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ global: true, maxListeners: 20 }),
    CommonModule,

    // Domen modullari (F-01 ... F-18)
    AuthModule,
    UsersModule,
    OrgModule,
    CurriculumModule,
    CoursesModule,
    ContentModule,
    AssignmentsModule,
    QuizzesModule,
    GradingModule,
    AttendanceModule,
    MessagingModule,
    ClassroomModule,
    CertificatesModule,
    AnalyticsModule,
    DocumentsModule,
    GamificationModule,
    AdminModule,
    IntegrationsModule,
    LtiModule,
    StudentModule,

    // Navbat ishlovchilari (ADR-004)
    WorkersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sayt boshqaruvidagi IP bloklovchi — autentifikatsiyadan ham oldin (F-17)
    { provide: APP_GUARD, useClass: IpBlockGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Foydalanuvchi aniqlangandan KEYIN: limit uning roli bo'yicha tanlanadi
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
