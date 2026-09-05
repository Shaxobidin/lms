/**
 * Maqsad: BullMQ ishlovchilarini ro'yxatdan o'tkazish (ADR-004).
 *
 * Ishlovchilar `APP_ROLE=worker` yoki `all` bo'lganda ishga tushadi.
 * `APP_ROLE=api` da faqat job qo'shiladi, bajarilmaydi — bu API
 * instansiyalarini og'ir ishlardan himoya qiladi.
 */

import { Module } from '@nestjs/common';
import { NotificationWorker } from './notification.worker';
import { MediaWorker } from './media.worker';
import { ReportWorker } from './report.worker';
import { MaintenanceWorker } from './maintenance.worker';
import { GradingWorker, PlagiarismWorker } from './grading.worker';
import { EmailWorker, SmsWorker, TelegramWorker } from './channel.worker';
import { MailerService } from './mailer.service';
import { NotificationTemplates } from './notification.templates';
import { ContentModule } from '../modules/content/content.module';
import { QuizzesModule } from '../modules/quizzes/quizzes.module';
import { DocumentsModule } from '../modules/documents/documents.module';
import { CertificatesModule } from '../modules/certificates/certificates.module';
import { GamificationModule } from '../modules/gamification/gamification.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';

@Module({
  imports: [
    ContentModule,
    QuizzesModule,
    DocumentsModule,
    CertificatesModule,
    GamificationModule,
    AnalyticsModule,
  ],
  providers: [
    MailerService,
    NotificationTemplates,
    NotificationWorker,
    MediaWorker,
    ReportWorker,
    MaintenanceWorker,
    GradingWorker,
    PlagiarismWorker,
    EmailWorker,
    SmsWorker,
    TelegramWorker,
  ],
})
export class WorkersModule {}
