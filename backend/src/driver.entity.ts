import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 255 })
  full_name: string;

  @Column({ unique: true, length: 100 })
  license_number: string;

  @Column({ length: 50, nullable: true })
  license_categories: string;

  @Column({ type: 'date', nullable: true })
  license_expiry: Date;

  @Column({ length: 512, nullable: true })
  face_id_hash: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
