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

@Module({
  imports: [WorkspaceModule, ActivityModule, NotificationModule],
  controllers: [CommentController, TaskCommentsController],
  providers: [CommentService, CommentRepository],
})
export class CommentModule {}
