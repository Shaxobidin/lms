/** Maqsad: F-07 modulini yig'ish. */

import { Module } from '@nestjs/common';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { GradingModule } from '../grading/grading.module';

@Module({
  imports: [GradingModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuestionsService],
  exports: [QuizzesService, QuestionsService],
})
export class QuizzesModule {}
