import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from './user.entity';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
    unique: true,
  })
  role: UserRole;

  @Column({ type: 'simple-json' })
  permissions: Record<string, unknown>;

  @UpdateDateColumn()
  updated_at: Date;
}

