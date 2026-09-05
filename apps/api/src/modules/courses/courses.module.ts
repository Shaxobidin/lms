/** Maqsad: F-04 modulini yig'ish. */

import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CurriculumModule } from '../curriculum/curriculum.module';

@Module({
  imports: [CurriculumModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
