import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('waybill_template_calibrations')
@Index(['template_key', 'page_number'], { unique: true })
export class WaybillTemplateCalibration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  template_key: string;

  @Column({ type: 'integer' })
  page_number: number;

  @Column({ type: 'real', default: 0 })
  offset_x: number;

  @Column({ type: 'real', default: 0 })
  offset_y: number;

  @Column({ type: 'real', default: 1 })
  scale_x: number;

  @Column({ type: 'real', default: 1 })
  scale_y: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
