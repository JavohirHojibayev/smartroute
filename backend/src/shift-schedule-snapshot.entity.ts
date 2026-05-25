import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Smena grafigi — bitta JSON (draft) */
@Entity('shift_schedule_snapshot')
export class ShiftScheduleSnapshot {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id: number;

  @Column({ type: 'text' })
  payload_json: string;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
