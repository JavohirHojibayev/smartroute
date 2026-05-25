import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('waybill_draft_values')
@Index(['draft_id', 'field_key'], { unique: true })
export class WaybillDraftValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  draft_id: number;

  @Column({ length: 120 })
  field_key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
