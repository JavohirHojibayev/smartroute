import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  DISPATCHER = 'dispatcher',
  MANAGER = 'manager',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 100 })
  username: string;

  @Column({ unique: true, length: 160, nullable: true })
  email: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ length: 255, nullable: true })
  full_name: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'datetime', nullable: true })
  last_login_at: Date;

  @Column({ length: 14, nullable: true })
  pinfl: string | null;

  @Column({ length: 20, nullable: true })
  inn: string | null;

  @Column({ name: 'certificate_serial', length: 128, nullable: true })
  certificate_serial: string | null;

  @Column({ name: 'eimzo_enabled', type: 'boolean', default: false })
  eimzo_enabled: boolean;

  @Column({ name: 'last_eimzo_login_at', type: 'datetime', nullable: true })
  last_eimzo_login_at: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  permissions: Record<string, ('none' | 'read' | 'full') | Array<'none' | 'read' | 'full'>> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
