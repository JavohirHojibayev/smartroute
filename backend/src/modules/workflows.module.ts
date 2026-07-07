import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from '../entities/fleet/trip.entity';
import { MedicalCheck } from '../entities/people/medical.entity';
import { MechanicalInspection } from '../entities/operations/mechanical.entity';
import { Driver } from '../entities/people/driver.entity';
import { Vehicle } from '../entities/fleet/vehicle.entity';
import { SmartStartService } from '../services/smart-start.service';
import { Controller, Post, Body } from '@nestjs/common';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly smartStartService: SmartStartService) {}

  @Post('generate-waybill')
  async generate(@Body() body: { driverId: number; vehicleId: number }) {
    return this.smartStartService.generateWaybill(body.driverId, body.vehicleId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, MedicalCheck, MechanicalInspection, Driver, Vehicle]),
  ],
  controllers: [WorkflowsController],
  providers: [SmartStartService],
})
export class WorkflowsModule {}
