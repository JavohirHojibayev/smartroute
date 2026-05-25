import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Driver } from './driver.entity';
import { User } from './user.entity';

export enum CheckStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('medical_checks')
export class MedicalCheck {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true, unique: true })
  esmo_id: number | null;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'checked_by' })
  checked_by_user: User;

  @Column({ length: 20, nullable: true })
  blood_pressure: string;

  @Column({ type: 'int', nullable: true })
  pulse: number;

  @Column('decimal', { precision: 4, scale: 2, nullable: true })
  temperature: number;

  @Column('decimal', { precision: 4, scale: 3, nullable: true })
  alcohol_test_result: number;

  @Column({ length: 128, nullable: true })
  terminal_name: string | null;

  @Column({ length: 64, nullable: true })
  terminal_ip: string | null;

  @Column({ length: 32, nullable: true })
  esmo_result: string | null;

  @Column({ type: 'simple-json', nullable: true })
  source_payload: any;

  @Column({
    type: 'simple-enum',
    enum: CheckStatus,
    default: CheckStatus.PENDING,
  })
  status: CheckStatus;

  @CreateDateColumn()
  check_time: Date;

  @Column({ type: 'datetime', nullable: true })
  exam_time: Date | null;
}
