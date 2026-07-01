import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Bitta JSON hujjat — frontend transport/guvohnoma ro'yxati */
@Entity('transport_registry_snapshot')
export class TransportRegistrySnapshot {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id: number;

  @Column({ type: 'text' })
  records_json: string;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
