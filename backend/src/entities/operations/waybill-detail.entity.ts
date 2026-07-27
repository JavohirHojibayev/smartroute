import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('waybill_details')
export class WaybillDetailRecord {
  @PrimaryColumn({ length: 128 })
  driver_key: string;

  @Column({ type: 'simple-json' })
  data_json: any;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
