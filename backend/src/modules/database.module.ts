import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from '../entities/fleet/vehicle.entity';
import { User } from '../entities/people/user.entity';
import { Driver } from '../entities/people/driver.entity';
import { MedicalCheck } from '../entities/people/medical.entity';
import { MechanicalInspection } from '../entities/operations/mechanical.entity';
import { Trip } from '../entities/fleet/trip.entity';
import { AccessLog, TurnstileIdentity, TurnstileStatusEvent } from './integrations.module';
import { resolve, sep } from 'path';
import { RolePermission } from '../entities/people/role-permission.entity';
import { OneCWeightEntry } from '../entities/hr/onec-weight-entry.entity';
import { FuelEntry } from '../entities/operations/fuel-entry.entity';
import { GarvexTrackingPoint } from '../entities/operations/garvex-tracking-point.entity';
import { TransportRegistrySnapshot } from '../entities/fleet/transport-registry-snapshot.entity';

import { ShiftScheduleSnapshot } from '../entities/scheduling/shift-schedule-snapshot.entity';
import { WaybillDraft } from '../waybill-pdf-editor/entities/waybill-draft.entity';
import { WaybillDraftValue } from '../waybill-pdf-editor/entities/waybill-draft-value.entity';
import { WaybillTemplateCalibration } from '../waybill-pdf-editor/entities/waybill-template-calibration.entity';
import { WaybillTemplateField } from '../waybill-pdf-editor/entities/waybill-template-field.entity';
import { EimzoLoginLog } from '../entities/auth/eimzo-login-log.entity';
import { ToolIssue } from '../entities/operations/tool-issue.entity';

const backendRoot = __dirname.includes(`${sep}dist${sep}`)
  ? resolve(__dirname, '..', '..', '..')
  : resolve(__dirname, '..', '..');

@Global()
@Module({
  imports: [
    // Keep SQLite path stable in both TS dev (`src`) and compiled (`dist/src`) runs.
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: resolve(backendRoot, process.env.SQLITE_DB_PATH || 'database.sqlite'),
      entities: [
        Vehicle,
        User,
        Driver,
        MedicalCheck,
        MechanicalInspection,
        Trip,
        AccessLog,
        TurnstileIdentity,
        TurnstileStatusEvent,
        RolePermission,
        OneCWeightEntry,
        FuelEntry,
        GarvexTrackingPoint,
        TransportRegistrySnapshot,
        ShiftScheduleSnapshot,
        WaybillTemplateField,
        WaybillTemplateCalibration,
        WaybillDraft,
        WaybillDraftValue,
        EimzoLoginLog,
        ToolIssue,
      ],
      synchronize: true,
      logging: String(process.env.TYPEORM_LOGGING ?? 'false').toLowerCase() === 'true',
    }),
    TypeOrmModule.forFeature([
      Vehicle,
      User,
      Driver,
      MedicalCheck,
      MechanicalInspection,
      Trip,
      AccessLog,
      TurnstileIdentity,
      TurnstileStatusEvent,
      RolePermission,
      OneCWeightEntry,
      FuelEntry,
      GarvexTrackingPoint,
      TransportRegistrySnapshot,
      ShiftScheduleSnapshot,
      WaybillTemplateField,
      WaybillTemplateCalibration,
      WaybillDraft,
      WaybillDraftValue,
      EimzoLoginLog,
      ToolIssue,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
