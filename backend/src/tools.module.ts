import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolIssue } from './tool-issue.entity';
import { ToolsController } from './tools.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ToolIssue])],
  controllers: [ToolsController],
})
export class ToolsModule {}
