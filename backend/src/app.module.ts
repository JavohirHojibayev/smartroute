import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database.module';
import { WorkflowsModule } from './workflows.module';
import { IntegrationsModule } from './integrations.module';
import { ReportingModule } from './reporting.module';
import { EsmoModule } from './esmo.module';
import { DashboardModule } from './dashboard.module';
import { AuthModule } from './auth.module';
import { UsersModule } from './users.module';
import { MechanicModule } from './mechanic.module';
import { OneCModule } from './onec.module';
import { AzsFuelModule } from './azs-fuel.module';
import { GarvexTrackingModule } from './garvex-tracking.module';
import { TransportRegistryModule } from './transport-registry.module';
import { ShiftScheduleModule } from './shift-schedule.module';
import { WaybillPdfEditorModule } from './waybill-pdf-editor/waybill-pdf-editor.module';

@Module({
  imports: [DatabaseModule, WorkflowsModule, IntegrationsModule, ReportingModule, EsmoModule, DashboardModule, AuthModule, UsersModule, MechanicModule, OneCModule, AzsFuelModule, GarvexTrackingModule, TransportRegistryModule, ShiftScheduleModule, WaybillPdfEditorModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
