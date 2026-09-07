/**
 * Maqsad: HEMIS uslubidagi "Talaba" bo'limi moduli.
 */

import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { GradingModule } from '../grading/grading.module';
import { DocumentsModule } from '../documents/documents.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [CoursesModule, GradingModule, DocumentsModule],
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
