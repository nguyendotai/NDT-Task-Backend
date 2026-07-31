import { Module } from '@nestjs/common';
import {
  ChecklistController,
  TaskChecklistsController,
} from './checklist.controller';
import { ChecklistService } from './checklist.service';
import { ChecklistRepository } from './checklist.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [WorkspaceModule, ActivityModule],
  controllers: [ChecklistController, TaskChecklistsController],
  providers: [ChecklistService, ChecklistRepository],
})
export class ChecklistModule {}
