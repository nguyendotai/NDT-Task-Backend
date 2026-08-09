import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  SprintController,
  WorkspaceSprintsController,
} from './sprint.controller';
import { SprintService } from './sprint.service';
import { SprintRepository } from './sprint.repository';
import { SprintSnapshotService } from './snapshot/sprint-snapshot.service';
import { SprintSnapshotProcessor } from './snapshot/sprint-snapshot.processor';
import { SprintSnapshotQueueService } from './snapshot/sprint-snapshot-queue.service';
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
    BullModule.registerQueue({ name: 'sprint-snapshot' }),
  ],
  controllers: [SprintController, WorkspaceSprintsController],
  providers: [
    SprintService,
    SprintRepository,
    SprintSnapshotService,
    SprintSnapshotProcessor,
    SprintSnapshotQueueService,
  ],
})
export class SprintModule {}
