import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Driver } from '../people/driver.entity';
import { Vehicle } from './vehicle.entity';
import { MedicalCheck } from '../people/medical.entity';
import { MechanicalInspection } from '../operations/mechanical.entity';

export enum TripStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Driver, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @ManyToOne(() => MedicalCheck, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'medical_check_id' })
  medical_check: MedicalCheck;

  @ManyToOne(() => MechanicalInspection, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mechanical_inspection_id' })
  mechanical_inspection: MechanicalInspection;

  @Column({
    type: 'simple-enum',
    enum: TripStatus,
    default: TripStatus.PENDING,
  })
  status: TripStatus;

  @Column({ type: 'datetime', nullable: true })
  start_time: Date;

  @Column({ type: 'datetime', nullable: true })
  end_time: Date;

  @Column({ type: 'integer', nullable: true })
  start_odometer: number;

  @Column({ type: 'integer', nullable: true })
  end_odometer: number;

  @Column({ type: 'text', nullable: true })
  route_description: string;

  @Column({ type: 'varchar', nullable: true, length: 100 })
  external_1c_id: string;

  @Column({ type: 'varchar', nullable: true, length: 50 })
  plate: string;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  cargo: string;

  @Column({ type: 'varchar', nullable: true, length: 50 })
  weight: string;

  @Column({ type: 'text', nullable: true })
  esmo_qr_data: string;

  @Column({ type: 'text', nullable: true })
  e_imzo_qr_data: string;

  @CreateDateColumn()
  created_at: Date;
}
