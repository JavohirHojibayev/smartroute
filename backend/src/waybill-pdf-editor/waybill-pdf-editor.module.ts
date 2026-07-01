import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../modules/auth.module';
import { WaybillDraft } from './entities/waybill-draft.entity';
import { WaybillDraftValue } from './entities/waybill-draft-value.entity';
import { WaybillTemplateCalibration } from './entities/waybill-template-calibration.entity';
import { WaybillTemplateField } from './entities/waybill-template-field.entity';
import { WaybillPdfEditorController } from './waybill-pdf-editor.controller';
import { WaybillPdfEditorService } from './waybill-pdf-editor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaybillTemplateField,
      WaybillTemplateCalibration,
      WaybillDraft,
      WaybillDraftValue,
    ]),
    AuthModule,
  ],
  controllers: [WaybillPdfEditorController],
  providers: [WaybillPdfEditorService],
})
export class WaybillPdfEditorModule {}
