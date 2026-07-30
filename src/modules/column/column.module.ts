import { Module } from '@nestjs/common';
import {
  ColumnController,
  WorkspaceColumnsController,
} from './column.controller';
import { ColumnService } from './column.service';
import { ColumnRepository } from './column.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [WorkspaceModule, ActivityModule],
  controllers: [ColumnController, WorkspaceColumnsController],
  providers: [ColumnService, ColumnRepository],
})
export class ColumnModule {}
