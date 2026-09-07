/** Maqsad: F-07 modulini yig'ish. */

import { Module } from '@nestjs/common';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { QuestionImportService } from './question-import.service';
import { GradingModule } from '../grading/grading.module';

@Module({
  imports: [GradingModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuestionsService, QuestionImportService],
  exports: [QuizzesService, QuestionsService],
})
export class QuizzesModule {}
