import { Module } from '@nestjs/common';
import { TaskController, WorkspaceTasksController } from './task.controller';
import { TaskService } from './task.service';
import { TaskRepository } from './task.repository';
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
  controllers: [TaskController, WorkspaceTasksController],
  providers: [TaskService, TaskRepository],
})
export class TaskModule {}
