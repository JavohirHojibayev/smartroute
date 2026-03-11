import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './vehicle.entity';
import { User } from './user.entity';
import { Driver } from './driver.entity';
import { MedicalCheck } from './medical.entity';
import { MechanicalInspection } from './mechanical.entity';
import { Trip } from './trip.entity';
import { AccessLog, TurnstileIdentity } from './integrations.module';
import { join } from 'path';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(process.cwd(), process.env.SQLITE_DB_PATH || 'database.sqlite'),
      entities: [Vehicle, User, Driver, MedicalCheck, MechanicalInspection, Trip, AccessLog, TurnstileIdentity],
      synchronize: true,
      logging: true,
    }),
    TypeOrmModule.forFeature([Vehicle, User, Driver, MedicalCheck, MechanicalInspection, Trip, AccessLog, TurnstileIdentity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

