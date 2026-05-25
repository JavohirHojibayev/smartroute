import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum VehicleCategory {
  TRUCK = 'truck',
  LIGHT_CAR = 'light_car',
  SPECIAL_MACHINERY = 'special_machinery',
  BUS = 'bus',
}

export enum FuelType {
  PETROL = 'petrol',
  DIESEL = 'diesel',
  CNG = 'cng',
  ELECTRIC = 'electric',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  plate_number: string;

  @Column({ unique: true, length: 100 })
  vin_code: string;

  @Column({ length: 100 })
  model: string;

  @Column({
    type: 'simple-enum',
    enum: VehicleCategory,
  })
  category: VehicleCategory;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  fuel_norm_per_100km: number;

  @Column({
    type: 'simple-enum',
    enum: FuelType,
    nullable: true,
  })
  fuel_type: FuelType;

  @Column({ type: 'integer', default: 0 })
  current_odometer: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
