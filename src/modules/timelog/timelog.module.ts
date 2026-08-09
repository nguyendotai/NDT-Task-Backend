import { Module } from '@nestjs/common';
import {
  TimeLogController,
  TaskTimeLogsController,
} from './timelog.controller';
import { TimeLogService } from './timelog.service';
import { TimeLogRepository } from './timelog.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WorkspaceModule, ActivityModule, RealtimeModule],
  controllers: [TimeLogController, TaskTimeLogsController],
  providers: [TimeLogService, TimeLogRepository],
})
export class TimeLogModule {}
