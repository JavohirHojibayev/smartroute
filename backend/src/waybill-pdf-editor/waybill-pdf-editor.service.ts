import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaybillDraft } from './entities/waybill-draft.entity';
import { WaybillDraftValue } from './entities/waybill-draft-value.entity';
import { WaybillTemplateCalibration } from './entities/waybill-template-calibration.entity';
import { WaybillTemplateField } from './entities/waybill-template-field.entity';

type FieldPayload = {
  fieldKey: string;
  label?: string | null;
  pageNumber: number;
  fieldType?: 'text' | 'number' | 'date' | 'textarea' | 'checkbox';
  bboxPdf: { x: number; y: number; width: number; height: number };
  renderStyle?: Record<string, unknown> | null;
  isActive?: boolean;
};

type CalibrationPayload = {
  pageNumber: number;
  offsetX?: number;
  offsetY?: number;
  scaleX?: number;
  scaleY?: number;
};

@Injectable()
export class WaybillPdfEditorService {
  constructor(
    @InjectRepository(WaybillTemplateField)
    private readonly fieldRepo: Repository<WaybillTemplateField>,
    @InjectRepository(WaybillTemplateCalibration)
    private readonly calibrationRepo: Repository<WaybillTemplateCalibration>,
    @InjectRepository(WaybillDraft)
    private readonly draftRepo: Repository<WaybillDraft>,
    @InjectRepository(WaybillDraftValue)
    private readonly draftValueRepo: Repository<WaybillDraftValue>,
  ) {}

  async getTemplate(templateKey: string) {
    const [fields, calibrations] = await Promise.all([
      this.fieldRepo.find({
        where: { template_key: templateKey, is_active: true },
        order: { page_number: 'ASC', id: 'ASC' },
      }),
      this.calibrationRepo.find({
        where: { template_key: templateKey },
        order: { page_number: 'ASC' },
      }),
    ]);

    return {
      templateKey,
      fields: fields.map((field) => ({
        fieldKey: field.field_key,
        label: field.label,
        pageNumber: field.page_number,
        fieldType: field.field_type,
        bboxPdf: field.bbox_pdf,
        renderStyle: field.render_style ?? null,
        isActive: field.is_active,
      })),
      calibrations: calibrations.map((calibration) => ({
        pageNumber: calibration.page_number,
        offsetX: calibration.offset_x,
        offsetY: calibration.offset_y,
        scaleX: calibration.scale_x,
        scaleY: calibration.scale_y,
      })),
    };
  }

  async saveTemplate(
    templateKey: string,
    fields: FieldPayload[] = [],
    calibrations: CalibrationPayload[] = [],
  ) {
    for (const item of fields) {
      const fieldKey = String(item.fieldKey ?? '').trim();
      if (!fieldKey) continue;

      const existing = await this.fieldRepo.findOne({
        where: { template_key: templateKey, field_key: fieldKey },
      });
      const next = existing ?? this.fieldRepo.create({ template_key: templateKey, field_key: fieldKey });
      next.label = item.label ?? null;
      next.page_number = Number(item.pageNumber || 1);
      next.field_type = (item.fieldType ?? 'text') as WaybillTemplateField['field_type'];
      next.bbox_pdf = {
        x: Number(item.bboxPdf?.x ?? 0),
        y: Number(item.bboxPdf?.y ?? 0),
        width: Number(item.bboxPdf?.width ?? 0),
        height: Number(item.bboxPdf?.height ?? 0),
      };
      next.render_style = item.renderStyle ?? null;
      next.is_active = item.isActive ?? true;
      await this.fieldRepo.save(next);
    }

    for (const item of calibrations) {
      const pageNumber = Number(item.pageNumber || 1);
      const existing = await this.calibrationRepo.findOne({
        where: { template_key: templateKey, page_number: pageNumber },
      });
      const next = existing ?? this.calibrationRepo.create({ template_key: templateKey, page_number: pageNumber });
      next.offset_x = Number(item.offsetX ?? 0);
      next.offset_y = Number(item.offsetY ?? 0);
      next.scale_x = Number(item.scaleX ?? 1);
      next.scale_y = Number(item.scaleY ?? 1);
      await this.calibrationRepo.save(next);
    }

    return this.getTemplate(templateKey);
  }

  private async getOrCreateDraft(templateKey: string, userId: number) {
    const existing = await this.draftRepo.findOne({
      where: { template_key: templateKey, user_id: userId },
    });
    if (existing) return existing;
    return this.draftRepo.save(this.draftRepo.create({ template_key: templateKey, user_id: userId }));
  }

  async getDraft(templateKey: string, userId: number) {
    const draft = await this.getOrCreateDraft(templateKey, userId);
    const values = await this.draftValueRepo.find({
      where: { draft_id: draft.id },
      order: { id: 'ASC' },
    });
    const map: Record<string, string> = {};
    values.forEach((item) => {
      map[item.field_key] = item.value ?? '';
    });
    return { templateKey, values: map, updatedAt: draft.updated_at };
  }

  async saveDraft(templateKey: string, userId: number, values: Record<string, unknown>) {
    const draft = await this.getOrCreateDraft(templateKey, userId);
    const entries = Object.entries(values ?? {});
    for (const [fieldKeyRaw, valueRaw] of entries) {
      const fieldKey = String(fieldKeyRaw).trim();
      if (!fieldKey) continue;
      const existing = await this.draftValueRepo.findOne({
        where: { draft_id: draft.id, field_key: fieldKey },
      });
      const next = existing ?? this.draftValueRepo.create({ draft_id: draft.id, field_key: fieldKey });
      next.value = valueRaw == null ? '' : String(valueRaw);
      await this.draftValueRepo.save(next);
    }
    await this.draftRepo.update({ id: draft.id }, {});
    return this.getDraft(templateKey, userId);
  }
}
