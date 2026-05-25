import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type WaybillFieldType = 'text' | 'number' | 'date' | 'textarea' | 'checkbox';

type BBoxPdf = {
  x: number;
  y: number;
  width: number;
  height: number;
};

@Entity('waybill_template_fields')
@Index(['template_key', 'field_key'], { unique: true })
export class WaybillTemplateField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  template_key: string;

  @Column({ length: 120 })
  field_key: string;

  @Column({ length: 180, nullable: true })
  label: string | null;

  @Column({ type: 'integer' })
  page_number: number;

  @Column({ type: 'simple-json' })
  bbox_pdf: BBoxPdf;

  @Column({ length: 24, default: 'text' })
  field_type: WaybillFieldType;

  @Column({ type: 'simple-json', nullable: true })
  render_style: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
