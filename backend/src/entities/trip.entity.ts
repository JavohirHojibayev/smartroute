import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';
import { MedicalCheck } from './medical.entity';
import { MechanicalInspection } from './mechanical.entity';

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

  @CreateDateColumn()
  created_at: Date;
}
