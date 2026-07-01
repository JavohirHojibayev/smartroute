import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import { AuthService } from '../modules/auth.module';
import { WaybillPdfEditorService } from './waybill-pdf-editor.service';

@Controller('waybill-editor')
export class WaybillPdfEditorController {
  private readonly templateKey = 'yol-varaqasi';

  constructor(
    private readonly waybillPdfEditorService: WaybillPdfEditorService,
    private readonly authService: AuthService,
  ) {}

  @Get('templates/yol-varaqasi/fields')
  async getTemplateFields(@Headers('authorization') authorization?: string) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.waybillPdfEditorService.getTemplate(this.templateKey);
  }

  @Put('templates/yol-varaqasi/fields')
  async saveTemplateFields(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      fields?: Array<{
        fieldKey: string;
        label?: string | null;
        pageNumber: number;
        fieldType?: 'text' | 'number' | 'date' | 'textarea' | 'checkbox';
        bboxPdf: { x: number; y: number; width: number; height: number };
        renderStyle?: Record<string, unknown> | null;
        isActive?: boolean;
      }>;
      calibrations?: Array<{
        pageNumber: number;
        offsetX?: number;
        offsetY?: number;
        scaleX?: number;
        scaleY?: number;
      }>;
    },
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.waybillPdfEditorService.saveTemplate(this.templateKey, body?.fields ?? [], body?.calibrations ?? []);
  }

  @Get('drafts/yol-varaqasi')
  async getDraft(@Headers('authorization') authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    return this.waybillPdfEditorService.getDraft(this.templateKey, user.id);
  }

  @Put('drafts/yol-varaqasi')
  async saveDraft(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { values?: Record<string, unknown> },
  ) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    return this.waybillPdfEditorService.saveDraft(this.templateKey, user.id, body?.values ?? {});
  }
}
