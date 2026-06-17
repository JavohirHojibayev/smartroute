import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tool_issues')
export class ToolIssue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  employee_id: string;

  @Column({ type: 'varchar', nullable: true })
  employee_no: string;

  @Column({ type: 'varchar', nullable: true })
  full_name: string;

  @Column({ type: 'varchar', default: 'Lamp/Self-rescuer' })
  tool_name: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'datetime', nullable: true })
  issued_at: Date;

  @Column({ type: 'datetime', nullable: true })
  returned_at: Date;

  @Column({ type: 'varchar', nullable: true })
  issuer: string;

  @Column({ type: 'varchar', default: 'ISSUED' })
  status: string; // 'ISSUED', 'DONE'

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
