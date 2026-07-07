import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './modules/database.module';
import { WorkflowsModule } from './modules/workflows.module';
import { IntegrationsModule } from './modules/integrations.module';
import { ReportingModule } from './modules/reporting.module';
import { EsmoModule } from './modules/esmo.module';
import { DashboardModule } from './modules/dashboard.module';
import { AuthModule } from './modules/auth.module';
import { UsersModule } from './modules/users.module';
import { MechanicModule } from './modules/mechanic.module';
import { OneCModule } from './modules/onec.module';
import { AzsFuelModule } from './modules/azs-fuel.module';
import { GarvexTrackingModule } from './modules/garvex-tracking.module';
import { TransportRegistryModule } from './modules/transport-registry.module';
import { ShiftScheduleModule } from './modules/shift-schedule.module';
import { WaybillPdfEditorModule } from './waybill-pdf-editor/waybill-pdf-editor.module';
import { EimzoAuthModule } from './modules/eimzo-auth.module';
import { ToolsModule } from './modules/tools.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 5000,
    }]),
    DatabaseModule, WorkflowsModule, IntegrationsModule, ReportingModule, EsmoModule, DashboardModule, AuthModule, EimzoAuthModule, UsersModule, MechanicModule, OneCModule, AzsFuelModule, GarvexTrackingModule, TransportRegistryModule, ShiftScheduleModule, WaybillPdfEditorModule, ToolsModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
