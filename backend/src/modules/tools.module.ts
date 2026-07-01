import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolIssue } from '../entities/tool-issue.entity';
import { ToolsController } from '../controllers/tools.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ToolIssue])],
  controllers: [ToolsController],
})
export class ToolsModule {}
