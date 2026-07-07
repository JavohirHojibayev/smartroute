import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolIssue } from '../entities/operations/tool-issue.entity';
import { ToolsController } from '../controllers/tools.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ToolIssue])],
  controllers: [ToolsController],
})
export class ToolsModule {}
