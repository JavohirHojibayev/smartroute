import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { User } from './user.entity';
import { CheckStatus } from './medical.entity';

@Entity('mechanical_inspections')
export class MechanicalInspection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'mechanic_id' })
  mechanic: User;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'simple-enum',
    enum: CheckStatus,
    default: CheckStatus.PENDING,
  })
  status: CheckStatus;

  @CreateDateColumn()
  inspection_time: Date;
}
