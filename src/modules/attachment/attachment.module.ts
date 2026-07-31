import { Module } from '@nestjs/common';
import {
  AttachmentController,
  TaskAttachmentsController,
} from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { AttachmentRepository } from './attachment.repository';
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
  controllers: [AttachmentController, TaskAttachmentsController],
  providers: [AttachmentService, AttachmentRepository],
})
export class AttachmentModule {}
