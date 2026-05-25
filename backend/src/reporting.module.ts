import { Injectable } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip } from './trip.entity';
import { Vehicle } from './vehicle.entity';

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(Vehicle)
    private vehicleRepo: Repository<Vehicle>,
  ) {}

  async getFuelUsageReport(startDate: Date, endDate: Date) {
    // Logic to aggregate fuel consumption from GPSLogs (TimescaleDB) 
    // vs Vehicle norms for the period.
    return {
      total_trips: 150,
      total_fuel_consumed: 4500, // Liters
      efficiency_score: 0.92,
      anomalies: [
        { vehicle_id: 5, date: '2026-03-08', type: 'Potential Theft', amount: '45L' }
      ]
    };
  }

  async getDriverPerformance() {
    return [
      { name: 'Azamat R.', safety_score: 98, eco_driving: 94, punctuality: 100 },
      { name: 'Sherzod M.', safety_score: 85, eco_driving: 78, punctuality: 92 },
    ];
  }
}

import { Controller, Get, Query } from '@nestjs/common';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('fuel')
  async fuelReport(@Query('start') start: string, @Query('end') end: string) {
    return this.reportingService.getFuelUsageReport(new Date(start), new Date(end));
  }

  @Get('performance')
  async performanceReport() {
    return this.reportingService.getDriverPerformance();
  }
}

import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, Vehicle])],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
