import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('fuel_entries')
export class FuelEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 160 })
  external_id: string;

  @Column({ length: 64, default: 'azs-online' })
  source_system: string;

  @Column({ type: 'datetime' })
  event_time: Date;

  @Column({ length: 32, nullable: true })
  vehicle_number: string | null;

  @Column({ length: 64, nullable: true })
  fuel_type: string | null;

  @Column({ type: 'real', nullable: true })
  liters: number | null;

  @Column({ type: 'real', nullable: true })
  amount: number | null;

  @Column({ length: 128, nullable: true })
  station_name: string | null;

  @Column({ length: 128, nullable: true })
  driver_name: string | null;

  @Column({ type: 'integer', nullable: true })
  event_type: number | null;

  @Column({ length: 64, nullable: true })
  pay_type: string | null;

  @Column({ length: 128, nullable: true })
  card_id: string | null;

  @Column({ length: 128, nullable: true })
  device_id: string | null;

  @Column({ length: 128, nullable: true })
  device_post_id: string | null;

  @Column({ type: 'text', nullable: true })
  event_message: string | null;

  @Column({ length: 128, nullable: true })
  entity_id: string | null;

  @Column({ length: 128, nullable: true })
  owner_id: string | null;

  @Column({ type: 'boolean', nullable: true })
  is_broken: boolean | null;

  @Column({ type: 'real', nullable: true })
  event_duration: number | null;

  @Column({ type: 'simple-json', nullable: true })
  payload: any;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
