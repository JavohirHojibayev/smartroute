import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip, TripStatus } from './trip.entity';
import { MedicalCheck, CheckStatus } from './medical.entity';
import { MechanicalInspection } from './mechanical.entity';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';

@Injectable()
export class SmartStartService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(MedicalCheck)
    private medicalRepo: Repository<MedicalCheck>,
    @InjectRepository(MechanicalInspection)
    private mechanicalRepo: Repository<MechanicalInspection>,
    @InjectRepository(Driver)
    private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehicleRepo: Repository<Vehicle>,
  ) {}

  async generateWaybill(driverId: number, vehicleId: number) {
    // 1. Get today's latest passed Medical Check for this driver
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const medicalCheck = await this.medicalRepo.createQueryBuilder('med')
      .where('med.driver_id = :driverId', { driverId })
      .andWhere('med.status = :status', { status: CheckStatus.PASSED })
      .andWhere('med.check_time >= :today', { today })
      .orderBy('med.check_time', 'DESC')
      .getOne();

    if (!medicalCheck) {
      throw new BadRequestException('Driver failed or has not taken the ESMO medical check today.');
    }

    // 2. Get today's latest passed Mechanical Inspection for this vehicle
    const mechCheck = await this.mechanicalRepo.createQueryBuilder('mech')
      .where('mech.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('mech.status = :status', { status: CheckStatus.PASSED })
      .andWhere('mech.inspection_time >= :today', { today })
      .orderBy('mech.inspection_time', 'DESC')
      .getOne();

    if (!mechCheck) {
      throw new BadRequestException('Vehicle failed or has not passed mechanical inspection today.');
    }

    const driver = await this.driverRepo.findOneBy({ id: driverId });
    const vehicle = await this.vehicleRepo.findOneBy({ id: vehicleId });

    if (!driver || !vehicle) {
      throw new BadRequestException('Driver or Vehicle not found.');
    }

    if (!driver.is_active || !vehicle.is_active) {
      throw new BadRequestException('Driver or Vehicle is currently inactive.');
    }

    // 3. Create the Digital Waybill
    const trip = this.tripsRepo.create({
      driver,
      vehicle,
      medical_check: medicalCheck,
      mechanical_inspection: mechCheck,
      status: TripStatus.PENDING, 
      start_odometer: vehicle.current_odometer,
      // Waybill is generated, it will become 'ACTIVE' when they actually start moving
    });

    return await this.tripsRepo.save(trip);
  }
}
