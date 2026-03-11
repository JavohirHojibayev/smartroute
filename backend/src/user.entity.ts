import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  TRANSPORT_MANAGER = 'transport_manager',
  DISPATCHER = 'dispatcher',
  MECHANIC = 'mechanic',
  MEDICAL_STAFF = 'medical_staff',
  DRIVER = 'driver',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 100 })
  username: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ length: 255, nullable: true })
  full_name: string;

  @CreateDateColumn()
  created_at: Date;
}
