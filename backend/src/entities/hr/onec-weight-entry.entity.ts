import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('onec_weight_entries')
export class OneCWeightEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 255 })
  external_id: string;

  @Index()
  @Column({ type: 'datetime' })
  measured_at: Date;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  source_updated_at: Date | null;

  @Index()
  @Column({ length: 64, nullable: true })
  plate: string | null;

  @Column({ length: 128, nullable: true })
  document_no: string | null;

  @Index()
  @Column({ length: 128, nullable: true })
  cargo_type: string | null;

  @Column('decimal', { precision: 14, scale: 3, nullable: true })
  gross_weight: number | null;

  @Column('decimal', { precision: 14, scale: 3, nullable: true })
  tare_weight: number | null;

  @Column('decimal', { precision: 14, scale: 3, nullable: true })
  net_weight: number | null;

  @Column({ type: 'simple-json', nullable: true })
  source_payload: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

