import { Module } from '@nestjs/common';
import {
  CommentController,
  TaskCommentsController,
} from './comment.controller';
import { CommentService } from './comment.service';
import { CommentRepository } from './comment.repository';
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
  controllers: [CommentController, TaskCommentsController],
  providers: [CommentService, CommentRepository],
})
export class CommentModule {}
