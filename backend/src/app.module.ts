import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database.module';
import { WorkflowsModule } from './workflows.module';
import { IntegrationsModule } from './integrations.module';
import { ReportingModule } from './reporting.module';
import { EsmoModule } from './esmo.module';
import { DashboardModule } from './dashboard.module';

@Module({
  imports: [DatabaseModule, WorkflowsModule, IntegrationsModule, ReportingModule, EsmoModule, DashboardModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
