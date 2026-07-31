import { Module } from '@nestjs/common';
import {
  SprintController,
  WorkspaceSprintsController,
} from './sprint.controller';
import { SprintService } from './sprint.service';
import { SprintRepository } from './sprint.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    WorkspaceModule,
    ActivityModule,
    NotificationModule,
    RealtimeModule,
  ],
  controllers: [SprintController, WorkspaceSprintsController],
  providers: [SprintService, SprintRepository],
})
export class SprintModule {}
