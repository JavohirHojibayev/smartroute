import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('garvex_tracking_points')
export class GarvexTrackingPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'integer' })
  unit_id: number;

  @Column({ length: 160, nullable: true })
  unit_name: string | null;

  @Column({ length: 80, nullable: true })
  object_code: string | null;

  @Column({ length: 64, nullable: true })
  status: string | null;

  @Column({ type: 'real', nullable: true })
  lat: number | null;

  @Column({ type: 'real', nullable: true })
  lng: number | null;

  @Column({ type: 'real', nullable: true })
  speed: number | null;

  @Column({ type: 'integer', nullable: true })
  direction: number | null;

  @Column({ type: 'boolean', nullable: true })
  ignition: boolean | null;

  @Column({ type: 'integer', nullable: true })
  satellites: number | null;

  @Column({ type: 'real', nullable: true })
  fuel_level: number | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'integer', nullable: true })
  last_message_unix: number | null;

  @Column({ type: 'datetime', nullable: true })
  last_message_at: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  payload: any;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
