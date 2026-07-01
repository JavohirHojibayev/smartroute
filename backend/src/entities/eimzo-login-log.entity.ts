import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('eimzo_login_logs')
export class EimzoLoginLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number | null;

  @Column({ length: 255, nullable: true })
  signerName: string | null;

  @Column({ length: 14, nullable: true })
  signerPinfl: string | null;

  @Column({ length: 20, nullable: true })
  signerInn: string | null;

  @Column({ length: 128, nullable: true })
  certificateSerial: string | null;

  @Column({ type: 'datetime' })
  loginAt: Date;

  @Column({ length: 80, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ length: 40 })
  status: string;
}
