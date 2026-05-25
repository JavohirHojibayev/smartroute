import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './trip.entity';
import { MedicalCheck } from './medical.entity';
import { MechanicalInspection } from './mechanical.entity';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';
import { SmartStartService } from './smart-start.service';
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
