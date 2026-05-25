import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('waybill_drafts')
@Index(['template_key', 'user_id'], { unique: true })
export class WaybillDraft {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  template_key: string;

  @Column({ type: 'integer' })
  user_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
