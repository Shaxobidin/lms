/** Maqsad: F-05 modulini yig'ish — fayl, SCORM, xAPI, progress. */

import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { FilesService } from './files.service';
import { ScormService } from './scorm.service';
import { CartridgeImportService } from './cc-import.service';
import { XapiService } from './xapi.service';
import { ProgressService } from './progress.service';

@Module({
  controllers: [ContentController],
  providers: [FilesService, ScormService, XapiService, ProgressService, CartridgeImportService],
  exports: [FilesService, ScormService, ProgressService],
})
export class ContentModule {}
