import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database.module';
import { WorkflowsModule } from './workflows.module';
import { IntegrationsModule } from './integrations.module';
import { ReportingModule } from './reporting.module';

@Module({
  imports: [DatabaseModule, WorkflowsModule, IntegrationsModule, ReportingModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
